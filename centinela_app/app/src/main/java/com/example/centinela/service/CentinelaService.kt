package com.example.centinela.service

import android.annotation.SuppressLint
import android.app.*
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.*
import android.util.Log
import androidx.core.app.NotificationCompat
import com.example.centinela.MainActivity
import com.example.centinela.R
import com.example.centinela.camera.HeadlessCameraManager
import com.example.centinela.data.CentinelaApi
import com.example.centinela.data.CentinelaPrefs
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject
import kotlin.math.sqrt

class CentinelaService : Service(), SensorEventListener, LocationListener {

    companion object {
        private const val TAG = "CentinelaService"
        private const val CHANNEL_ID = "centinela_channel_id"
        private const val NOTIFICATION_ID = 1001

        const val ACTION_START = "com.example.centinela.action.START"
        const val ACTION_STOP = "com.example.centinela.action.STOP"
        const val ACTION_TRIGGER_PHOTO = "com.example.centinela.action.TRIGGER_PHOTO"
        const val ACTION_TRIGGER_EARTHQUAKE = "com.example.centinela.action.TRIGGER_EARTHQUAKE"
        const val ACTION_TRIGGER_FLOOD = "com.example.centinela.action.TRIGGER_FLOOD"
        const val ACTION_TRIGGER_HEARTBEAT = "com.example.centinela.action.TRIGGER_HEARTBEAT"

        data class LiveState(
            val isRunning: Boolean = false,
            val currentAccX: Float = 0f,
            val currentAccY: Float = 0f,
            val currentAccZ: Float = 0f,
            val currentAccMagnitude: Float = 0f,
            val lastSeismicAlert: String? = null,
            val lastSeismicMagnitude: Float = 0f,
            val batteryLevel: Int = 100,
            val isCharging: Boolean = false,
            val batteryTemp: Double = 0.0,
            val latitude: Double? = null,
            val longitude: Double? = null,
            val lastHeartbeatSuccess: Boolean? = null,
            val lastHeartbeatTime: Long = 0L,
            val lastPhotoTime: Long = 0L,
            val lastPhotoStatus: String? = null,
            val isTakingPhoto: Boolean = false
        )

        private val _liveState = MutableStateFlow(LiveState())
        val liveState = _liveState.asStateFlow()

        fun start(context: Context) {
            val intent = Intent(context, CentinelaService::class.java).apply {
                action = ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, CentinelaService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }

        fun triggerPhoto(context: Context) {
            val intent = Intent(context, CentinelaService::class.java).apply {
                action = ACTION_TRIGGER_PHOTO
            }
            context.startService(intent)
        }

        fun triggerEarthquakeAlert(context: Context) {
            val intent = Intent(context, CentinelaService::class.java).apply {
                action = ACTION_TRIGGER_EARTHQUAKE
            }
            context.startService(intent)
        }

        fun triggerFloodAlert(context: Context) {
            val intent = Intent(context, CentinelaService::class.java).apply {
                action = ACTION_TRIGGER_FLOOD
            }
            context.startService(intent)
        }

        fun triggerHeartbeat(context: Context) {
            val intent = Intent(context, CentinelaService::class.java).apply {
                action = ACTION_TRIGGER_HEARTBEAT
            }
            context.startService(intent)
        }
    }

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private lateinit var prefs: CentinelaPrefs
    private val api = CentinelaApi()
    private lateinit var cameraManager: HeadlessCameraManager

    private var wakeLock: PowerManager.WakeLock? = null
    private var sensorManager: SensorManager? = null
    private var accelerometer: Sensor? = null
    private var locationManager: LocationManager? = null

    private var lastSeismicTriggerTime = 0L
    private val seismicCooldownMs = 10000L // 10 seconds debounce
    private var cameraJob: Job? = null
    private var commandJob: Job? = null

    override fun onCreate() {
        super.onCreate()
        prefs = CentinelaPrefs(this)
        cameraManager = HeadlessCameraManager(this)

        createNotificationChannel()
        startServiceForeground("Centinela Activo", "Monitoreando sensores en tiempo real")

        acquireWakeLock()
        initSensors()
        initLocation()

        prefs.isServiceActive = true
        _liveState.value = _liveState.value.copy(isRunning = true)

        startPeriodicHeartbeats()
        startPeriodicCameraCaptures()
        startCommandListener()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_TRIGGER_PHOTO -> {
                serviceScope.launch { captureAndUploadEvidence(triggerType = "manual", notes = "Captura manual solicitada") }
            }
            ACTION_TRIGGER_EARTHQUAKE -> {
                serviceScope.launch { dispatchSeismicAlert(24.5f, force = true, ax = 12.5f, ay = 14.8f, az = 15.2f) }
            }
            ACTION_TRIGGER_FLOOD -> {
                serviceScope.launch {
                    captureAndUploadEvidence(
                        triggerType = "flood_simulated",
                        notes = "Simulación manual de inundación",
                        simulateFlood = true
                    )
                }
            }

            ACTION_TRIGGER_HEARTBEAT -> {
                serviceScope.launch { executeHeartbeat() }
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()

        sensorManager?.unregisterListener(this)
        locationManager?.removeUpdates(this)

        releaseWakeLock()

        prefs.isServiceActive = false
        _liveState.value = _liveState.value.copy(isRunning = false)
        Log.i(TAG, "CentinelaService detenido")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // --- Foreground Notification ---
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Canal Centinela Nodo",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Monitoreo continuo en segundo plano de sensores y alertas"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun startServiceForeground(title: String, text: String) {
        val notificationIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, notificationIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            var serviceType = ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                serviceType = serviceType or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            }
            startForeground(NOTIFICATION_ID, notification, serviceType)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun updateNotification(title: String, text: String) {
        val notificationIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, notificationIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, notification)
    }

    // --- WakeLock ---
    @SuppressLint("WakelockTimeout")
    private fun acquireWakeLock() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Centinela:ServiceWakeLock")
        wakeLock?.acquire()
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error releasing wakelock", e)
        }
    }

    // --- Sensors ---
    private fun initSensors() {
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        accelerometer?.let {
            sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_UI)
        }
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event?.sensor?.type == Sensor.TYPE_ACCELEROMETER) {
            val ax = event.values[0]
            val ay = event.values[1]
            val az = event.values[2]
            val magnitude = sqrt((ax * ax + ay * ay + az * az).toDouble()).toFloat()

            _liveState.value = _liveState.value.copy(
                currentAccX = ax,
                currentAccY = ay,
                currentAccZ = az,
                currentAccMagnitude = magnitude
            )

            val threshold = prefs.seismicThreshold
            if (magnitude >= threshold) {
                val now = System.currentTimeMillis()
                if (now - lastSeismicTriggerTime > seismicCooldownMs) {
                    lastSeismicTriggerTime = now
                    serviceScope.launch {
                        dispatchSeismicAlert(magnitude, force = false, ax = ax, ay = ay, az = az)
                    }
                }
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private suspend fun dispatchSeismicAlert(
        magnitude: Float,
        force: Boolean = false,
        ax: Float = 0f,
        ay: Float = 0f,
        az: Float = 0f
    ) {
        val apiKey = prefs.apiKey
        if (apiKey.isEmpty() && !force) {
            Log.w(TAG, "Nodo no autorizado todavía, no se puede enviar alerta sísmica")
            return
        }

        val formattedMag = String.format("%.2f", magnitude)
        Log.w(TAG, "⚠️ ALERTA SÍSMICA DETECTADA: $formattedMag m/s²")
        updateNotification("⚠️ ALERTA SÍSMICA DETECTADA", "Magnitud: $formattedMag m/s²")

        _liveState.value = _liveState.value.copy(
            lastSeismicAlert = "¡Sismo detectado! $formattedMag m/s²",
            lastSeismicMagnitude = magnitude
        )

        // Quitar la alerta visual de sismo en el dispositivo tras 5 segundos
        serviceScope.launch {
            delay(5000L)
            if (_liveState.value.lastSeismicMagnitude == magnitude) {
                _liveState.value = _liveState.value.copy(
                    lastSeismicAlert = null,
                    lastSeismicMagnitude = 0f
                )
                updateNotification("Centinela Activo", "Monitoreando sensores en tiempo real")
            }
        }

        val telemetryData = JSONObject().apply {
            put("ax", ax)
            put("ay", ay)
            put("az", az)
            put("magnitude", magnitude)
            put("threshold", prefs.seismicThreshold)
        }

        api.sendTelemetry(
            serverUrl = prefs.serverUrl,
            apiKey = apiKey,
            identifier = prefs.deviceIdentifier,
            type = "earthquake",
            source = "accelerometer",
            value = magnitude.toDouble(),
            unit = "m/s^2",
            status = "danger",
            data = telemetryData,
            latitude = _liveState.value.latitude,
            longitude = _liveState.value.longitude
        )
    }

    // --- Location ---
    @SuppressLint("MissingPermission")
    private fun initLocation() {
        locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        try {
            if (locationManager?.isProviderEnabled(LocationManager.GPS_PROVIDER) == true) {
                locationManager?.requestLocationUpdates(LocationManager.GPS_PROVIDER, 15000L, 10f, this)
            }
            if (locationManager?.isProviderEnabled(LocationManager.NETWORK_PROVIDER) == true) {
                locationManager?.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 15000L, 10f, this)
            }
            // Read last known
            val lastGps = locationManager?.getLastKnownLocation(LocationManager.GPS_PROVIDER)
            val lastNet = locationManager?.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
            val best = lastGps ?: lastNet
            best?.let { onLocationChanged(it) }
        } catch (e: Exception) {
            Log.w(TAG, "Location access warning", e)
        }
    }

    override fun onLocationChanged(location: Location) {
        _liveState.value = _liveState.value.copy(
            latitude = location.latitude,
            longitude = location.longitude
        )
    }

    // --- Periodic Heartbeats ---
    private fun startPeriodicHeartbeats() {
        serviceScope.launch {
            while (isActive) {
                executeHeartbeat()
                val intervalSec = prefs.heartbeatIntervalSeconds.coerceAtLeast(10)
                delay(intervalSec * 1000L)
            }
        }
    }

    private suspend fun executeHeartbeat() {
        val apiKey = prefs.apiKey
        if (apiKey.isEmpty()) return

        val batteryStatus = getBatteryInfo()
        _liveState.value = _liveState.value.copy(
            batteryLevel = batteryStatus.level,
            isCharging = batteryStatus.isCharging,
            batteryTemp = batteryStatus.temperature
        )

        val hbResult = api.sendHeartbeat(
            serverUrl = prefs.serverUrl,
            apiKey = apiKey,
            identifier = prefs.deviceIdentifier,
            batteryLevel = batteryStatus.level,
            isCharging = batteryStatus.isCharging,
            batteryTemp = batteryStatus.temperature,
            latitude = _liveState.value.latitude,
            longitude = _liveState.value.longitude
        )

        _liveState.value = _liveState.value.copy(
            lastHeartbeatSuccess = hbResult.success,
            lastHeartbeatTime = System.currentTimeMillis()
        )

        if (hbResult.success) {
            // Sincronizar intervalo de fotos si el servidor lo configuró
            if (hbResult.photoIntervalMinutes != null && hbResult.photoIntervalMinutes > 0 && hbResult.photoIntervalMinutes != prefs.photoIntervalMinutes) {
                Log.i(TAG, "Servidor actualizó intervalo de fotos a ${hbResult.photoIntervalMinutes} min")
                prefs.photoIntervalMinutes = hbResult.photoIntervalMinutes
                startPeriodicCameraCaptures()
            }
            // Sincronizar umbral sísmico
            if (hbResult.movementThreshold != null) {
                prefs.seismicThreshold = hbResult.movementThreshold
            }
            // Sincronizar estado de silencio (isMuted) con el portal web
            if (hbResult.isMuted != null && hbResult.isMuted != prefs.isMuted) {
                Log.i(TAG, "Servidor actualizó estado de silencio a: ${hbResult.isMuted}")
                prefs.isMuted = hbResult.isMuted
            }
            // Ejecutar comandos remotos enviados por el panel administrativo
            for (cmd in hbResult.commands) {
                if (cmd == "capture_photo" || cmd == "take_photo") {
                    Log.i(TAG, "Comando remoto recibido: captura de foto solicitada desde panel de control")
                    serviceScope.launch {
                        captureAndUploadEvidence(triggerType = "remote_admin", notes = "Captura solicitada desde el Panel de Control")
                    }
                }
            }
        }
    }

    // --- Fast Remote Command Listener ---
    private fun startCommandListener() {
        commandJob?.cancel()
        commandJob = serviceScope.launch {
            while (isActive) {
                try {
                    val apiKey = prefs.apiKey
                    if (apiKey.isNotEmpty() && prefs.isAuthorized) {
                        val commands = api.pollCommands(prefs.serverUrl, apiKey, prefs.deviceIdentifier)
                        for (cmd in commands) {
                            if (cmd == "capture_photo" || cmd == "take_photo") {
                                Log.i(TAG, "Comando remoto inmediato recibido por polling rápido: $cmd")
                                captureAndUploadEvidence(
                                    triggerType = "remote_admin",
                                    notes = "Captura solicitada desde el Panel de Control"
                                )
                            }
                        }
                    }
                } catch (e: Exception) {
                    // Evitar que excepciones de red detengan el bucle de polling
                }
                delay(2000L) // Polling rápido cada 2 segundos
            }
        }
    }

    data class BatteryInfo(val level: Int, val isCharging: Boolean, val temperature: Double)

    private fun getBatteryInfo(): BatteryInfo {
        val intentFilter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        val batteryStatus = registerReceiver(null, intentFilter)

        val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: 100
        val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: 100
        val batteryPct = if (level >= 0 && scale > 0) (level * 100) / scale else 100

        val status = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL

        val rawTemp = batteryStatus?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) ?: 0
        val tempCelsius = rawTemp / 10.0

        return BatteryInfo(batteryPct, isCharging, tempCelsius)
    }

    // --- Periodic Headless Camera ---
    private fun startPeriodicCameraCaptures() {
        cameraJob?.cancel()
        cameraJob = serviceScope.launch {
            // Initial delay before first scheduled photo to let service stabilize
            delay(10000L)
            while (isActive) {
                captureAndUploadEvidence(triggerType = "flood_monitor", notes = "Captura periódica programada")
                val intervalMin = prefs.photoIntervalMinutes.coerceAtLeast(1)
                delay(intervalMin * 60 * 1000L)
            }
        }
    }

    private suspend fun captureAndUploadEvidence(triggerType: String, notes: String, simulateFlood: Boolean = false) {
        val apiKey = prefs.apiKey
        if (apiKey.isEmpty()) {
            Log.w(TAG, "No se puede capturar evidencia: nodo no autorizado")
            return
        }

        _liveState.value = _liveState.value.copy(isTakingPhoto = true)
        val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager
        @Suppress("DEPRECATION")
        val screenLock = powerManager?.newWakeLock(
            PowerManager.SCREEN_DIM_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "Centinela:CameraDimWakeLock"
        )
        try {
            screenLock?.acquire(8000L)
            val captureResult = cameraManager.capturePhoto()
            if (captureResult.isSuccess) {
                val bytes = captureResult.getOrThrow()
                Log.i(TAG, "Foto tomada con éxito (${bytes.size} bytes), subiendo evidencia...")

                val uploadResult = api.uploadEvidence(
                    serverUrl = prefs.serverUrl,
                    apiKey = apiKey,
                    identifier = prefs.deviceIdentifier,
                    jpegBytes = bytes,
                    latitude = _liveState.value.latitude,
                    longitude = _liveState.value.longitude,
                    triggerType = triggerType,
                    notes = notes,
                    simulateFlood = simulateFlood
                )

                val statusText = if (uploadResult.success) {
                    if (uploadResult.floodDetected) {
                        "⚠️ Inundación detectada: ${uploadResult.severity} (${uploadResult.waterLevelCm} cm)"
                    } else {
                        "✅ Foto analizada: Sin inundación"
                    }
                } else {
                    "Error al subir: ${uploadResult.message}"
                }

                _liveState.value = _liveState.value.copy(
                    lastPhotoTime = System.currentTimeMillis(),
                    lastPhotoStatus = statusText
                )
            } else {
                val err = captureResult.exceptionOrNull()?.localizedMessage ?: "Error de captura"
                _liveState.value = _liveState.value.copy(
                    lastPhotoStatus = "Error de cámara: $err"
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in captureAndUploadEvidence", e)
            _liveState.value = _liveState.value.copy(
                lastPhotoStatus = "Excepción: ${e.localizedMessage}"
            )
        } finally {
            if (screenLock?.isHeld == true) {
                try {
                    screenLock.release()
                } catch (_: Exception) {}
            }
            _liveState.value = _liveState.value.copy(isTakingPhoto = false)
        }
    }
}
