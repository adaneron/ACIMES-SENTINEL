package com.example.centinela.camera

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.SurfaceTexture
import android.hardware.camera2.*
import android.media.ExifInterface
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.util.Size
import android.view.Surface
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

class HeadlessCameraManager(private val context: Context) {

    companion object {
        private const val TAG = "HeadlessCamera"
        private const val DEFAULT_WIDTH = 1280
        private const val DEFAULT_HEIGHT = 720
        private const val AE_CONVERGENCE_DELAY_MS = 800L
    }

    private val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
    private val isCapturing = AtomicBoolean(false)

    @SuppressLint("MissingPermission")
    suspend fun capturePhoto(): Result<ByteArray> = suspendCancellableCoroutine { continuation ->
        if (!isCapturing.compareAndSet(false, true)) {
            continuation.resume(Result.failure(IllegalStateException("La cámara ya está ocupada")))
            return@suspendCancellableCoroutine
        }

        val handlerThread = HandlerThread("CameraBackgroundThread").apply { start() }
        val handler = Handler(handlerThread.looper)

        var cameraDevice: CameraDevice? = null
        var captureSession: CameraCaptureSession? = null
        var imageReader: ImageReader? = null
        var surfaceTexture: SurfaceTexture? = null
        var previewSurface: Surface? = null
        var resumed = false

        fun cleanup() {
            try {
                captureSession?.stopRepeating()
            } catch (_: Exception) {}
            try {
                captureSession?.close()
            } catch (_: Exception) {}
            try {
                cameraDevice?.close()
            } catch (_: Exception) {}
            try {
                imageReader?.close()
            } catch (_: Exception) {}
            try {
                previewSurface?.release()
            } catch (_: Exception) {}
            try {
                surfaceTexture?.release()
            } catch (_: Exception) {}
            try {
                handlerThread.quitSafely()
            } catch (_: Exception) {}
            isCapturing.set(false)
        }

        // Safety timeout of 12 seconds
        handler.postDelayed({
            if (!resumed && continuation.isActive) {
                resumed = true
                cleanup()
                continuation.resume(Result.failure(java.util.concurrent.TimeoutException("Tiempo de espera agotado al capturar foto")))
            }
        }, 12000L)

        try {
            // Find back camera
            var targetCameraId: String? = null
            for (id in cameraManager.cameraIdList) {
                val characteristics = cameraManager.getCameraCharacteristics(id)
                val facing = characteristics.get(CameraCharacteristics.LENS_FACING)
                if (facing == CameraCharacteristics.LENS_FACING_BACK) {
                    targetCameraId = id
                    break
                }
            }
            if (targetCameraId == null && cameraManager.cameraIdList.isNotEmpty()) {
                targetCameraId = cameraManager.cameraIdList[0]
            }

            if (targetCameraId == null) {
                resumed = true
                cleanup()
                continuation.resume(Result.failure(IllegalStateException("No se encontró ninguna cámara disponible")))
                return@suspendCancellableCoroutine
            }

            val characteristics = cameraManager.getCameraCharacteristics(targetCameraId)
            val map = characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
            val supportedSizes = map?.getOutputSizes(ImageFormat.JPEG) ?: arrayOf(Size(DEFAULT_WIDTH, DEFAULT_HEIGHT))

            // Pick a moderate resolution (around 1280x720 or 1920x1080) for efficient upload & OCR
            val chosenSize = supportedSizes.firstOrNull { it.width in 1280..1920 } ?: supportedSizes[0]

            // Calculate positive exposure compensation (+1.5 EV)
            val compensationRange = characteristics.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_RANGE)
            val compensationStep = characteristics.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_STEP)
            var exposureCompensationIndex = 0
            if (compensationRange != null && compensationStep != null) {
                val step = compensationStep.toFloat()
                if (step > 0f) {
                    val desiredEv = 1.5f
                    val steps = (desiredEv / step).toInt()
                    exposureCompensationIndex = steps.coerceIn(compensationRange.lower, compensationRange.upper)
                    Log.i(TAG, "Compensación de exposición fijada en $exposureCompensationIndex pasos (+${exposureCompensationIndex * step} EV)")
                }
            }

            // Dummy SurfaceTexture to allow the ISP hardware 3A engine to run and calculate exposure
            val tex = SurfaceTexture(42).apply {
                setDefaultBufferSize(640, 480)
            }
            surfaceTexture = tex
            val prevSurf = Surface(tex)
            previewSurface = prevSurf

            // JPEG ImageReader for the still photo
            val readerInstance = ImageReader.newInstance(chosenSize.width, chosenSize.height, ImageFormat.JPEG, 2)
            imageReader = readerInstance
            readerInstance.setOnImageAvailableListener({ reader ->
                val image = reader.acquireLatestImage()
                if (image != null) {
                    try {
                        val planes = image.planes
                        val buffer = planes[0].buffer
                        val rawBytes = ByteArray(buffer.remaining())
                        buffer.get(rawBytes)

                        // Normalizar orientación física del raster de la imagen
                        val sensorOrientation = characteristics.get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 90
                        val finalBytes = try {
                            val bitmap = BitmapFactory.decodeByteArray(rawBytes, 0, rawBytes.size)
                            if (bitmap != null) {
                                val exif = ExifInterface(ByteArrayInputStream(rawBytes))
                                val orientationAttr = exif.getAttributeInt(
                                    ExifInterface.TAG_ORIENTATION,
                                    ExifInterface.ORIENTATION_UNDEFINED
                                )
                                val rotationAngle = when (orientationAttr) {
                                    ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                                    ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                                    ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                                    else -> {
                                        // Si la orientación EXIF no está explícita pero la imagen fue guardada en horizontal
                                        // mientras el sensor físico está a 90° (típico en teléfonos verticales en reposo):
                                        if (bitmap.width > bitmap.height && sensorOrientation == 90) {
                                            90f
                                        } else {
                                            0f
                                        }
                                    }
                                }

                                if (rotationAngle != 0f) {
                                    val matrix = Matrix().apply { postRotate(rotationAngle) }
                                    val rotatedBitmap = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
                                    val bos = ByteArrayOutputStream()
                                    rotatedBitmap.compress(Bitmap.CompressFormat.JPEG, 90, bos)
                                    if (rotatedBitmap != bitmap) {
                                        bitmap.recycle()
                                    }
                                    rotatedBitmap.recycle()
                                    Log.i(TAG, "Imagen rotada físicamente ${rotationAngle}° para orientación vertical óptima")
                                    bos.toByteArray()
                                } else {
                                    bitmap.recycle()
                                    rawBytes
                                }
                            } else {
                                rawBytes
                            }
                        } catch (e: Exception) {
                            Log.w(TAG, "Error normalizando rotación de imagen, usando bytes originales: ${e.message}")
                            rawBytes
                        }

                        if (!resumed && continuation.isActive) {
                            resumed = true
                            Log.i(TAG, "Foto capturada exitosamente con exposición y orientación calibradas (${finalBytes.size} bytes)")
                            continuation.resume(Result.success(finalBytes))
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error procesando buffer de imagen", e)
                        if (!resumed && continuation.isActive) {
                            resumed = true
                            continuation.resume(Result.failure(e))
                        }
                    } finally {
                        image.close()
                        cleanup()
                    }
                }
            }, handler)

            val sessionSurfaces = listOf(prevSurf, readerInstance.surface)

            cameraManager.openCamera(targetCameraId, object : CameraDevice.StateCallback() {
                override fun onOpened(camera: CameraDevice) {
                    cameraDevice = camera
                    try {
                        @Suppress("DEPRECATION")
                        camera.createCaptureSession(
                            sessionSurfaces,
                            object : CameraCaptureSession.StateCallback() {
                                override fun onConfigured(session: CameraCaptureSession) {
                                    captureSession = session
                                    try {
                                        // 1. Iniciar previsualización en SurfaceTexture dummy para que el ISP ajuste exposición y balance de blancos
                                        val previewBuilder = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
                                            addTarget(prevSurf)
                                            set(CaptureRequest.CONTROL_MODE, CameraMetadata.CONTROL_MODE_AUTO)
                                            set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
                                            set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
                                            set(CaptureRequest.CONTROL_AWB_MODE, CaptureRequest.CONTROL_AWB_MODE_AUTO)
                                            set(CaptureRequest.CONTROL_AE_ANTIBANDING_MODE, CaptureRequest.CONTROL_AE_ANTIBANDING_MODE_AUTO)
                                            if (exposureCompensationIndex != 0) {
                                                set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, exposureCompensationIndex)
                                            }
                                        }

                                        session.setRepeatingRequest(previewBuilder.build(), null, handler)

                                        // 2. Dar 800ms para que Auto-Exposure estabilice y luego disparar still capture en ImageReader
                                        handler.postDelayed({
                                            if (resumed || !continuation.isActive) return@postDelayed
                                            try {
                                                val stillBuilder = camera.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE).apply {
                                                    addTarget(readerInstance.surface)
                                                    set(CaptureRequest.CONTROL_MODE, CameraMetadata.CONTROL_MODE_AUTO)
                                                    set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
                                                    set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
                                                    set(CaptureRequest.CONTROL_AWB_MODE, CaptureRequest.CONTROL_AWB_MODE_AUTO)
                                                    set(CaptureRequest.CONTROL_AE_ANTIBANDING_MODE, CaptureRequest.CONTROL_AE_ANTIBANDING_MODE_AUTO)
                                                    if (exposureCompensationIndex != 0) {
                                                        set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, exposureCompensationIndex)
                                                    }
                                                    set(CaptureRequest.JPEG_QUALITY, 90.toByte())
                                                    val sensorOrientation = characteristics.get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 90
                                                    set(CaptureRequest.JPEG_ORIENTATION, sensorOrientation)
                                                }

                                                session.capture(stillBuilder.build(), null, handler)
                                                Log.i(TAG, "Disparo de captura estática enviado a la sesión")
                                            } catch (e: Exception) {
                                                Log.e(TAG, "Error enviando still capture request", e)
                                                if (!resumed && continuation.isActive) {
                                                    resumed = true
                                                    continuation.resume(Result.failure(e))
                                                }
                                                cleanup()
                                            }
                                        }, AE_CONVERGENCE_DELAY_MS)

                                    } catch (e: Exception) {
                                        Log.e(TAG, "Failed to start preview repeating request", e)
                                        if (!resumed && continuation.isActive) {
                                            resumed = true
                                            continuation.resume(Result.failure(e))
                                        }
                                        cleanup()
                                    }
                                }

                                override fun onConfigureFailed(session: CameraCaptureSession) {
                                    Log.e(TAG, "Camera capture session configuration failed")
                                    if (!resumed && continuation.isActive) {
                                        resumed = true
                                        continuation.resume(Result.failure(RuntimeException("Error configurando sesión de captura")))
                                    }
                                    cleanup()
                                }
                            },
                            handler
                        )
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to create capture session", e)
                        if (!resumed && continuation.isActive) {
                            resumed = true
                            continuation.resume(Result.failure(e))
                        }
                        cleanup()
                    }
                }

                override fun onDisconnected(camera: CameraDevice) {
                    Log.w(TAG, "Camera disconnected")
                    if (!resumed && continuation.isActive) {
                        resumed = true
                        continuation.resume(Result.failure(RuntimeException("Cámara desconectada")))
                    }
                    cleanup()
                }

                override fun onError(camera: CameraDevice, error: Int) {
                    Log.e(TAG, "Camera error: $error")
                    if (!resumed && continuation.isActive) {
                        resumed = true
                        continuation.resume(Result.failure(RuntimeException("Error en la cámara de hardware: $error")))
                    }
                    cleanup()
                }
            }, handler)

        } catch (e: Exception) {
            Log.e(TAG, "Failed opening camera", e)
            if (!resumed && continuation.isActive) {
                resumed = true
                continuation.resume(Result.failure(e))
            }
            cleanup()
        }

        continuation.invokeOnCancellation {
            cleanup()
        }
    }
}
