package com.example.centinela.data

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

class CentinelaApi {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS) // OCR analysis may take ~10-20 seconds on LM Studio
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    companion object {
        private const val TAG = "CentinelaApi"
        private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
        private val JPEG_MEDIA_TYPE = "image/jpeg".toMediaType()
    }

    data class RegisterResult(
        val success: Boolean,
        val isAuthorized: Boolean,
        val status: String,
        val message: String
    )

    data class NodeStatusResult(
        val success: Boolean,
        val isAuthorized: Boolean,
        val status: String,
        val apiKey: String? = null,
        val message: String? = null
    )

    data class EvidenceUploadResult(
        val success: Boolean,
        val evidenceId: Int? = null,
        val floodDetected: Boolean = false,
        val waterLevelCm: Double? = null,
        val severity: String? = null,
        val message: String? = null
    )

    data class HeartbeatResult(
        val success: Boolean,
        val photoIntervalMinutes: Int? = null,
        val movementThreshold: Float? = null,
        val isMuted: Boolean? = null,
        val commands: List<String> = emptyList()
    )

    suspend fun registerNode(
        serverUrl: String,
        identifier: String,
        name: String,
        type: String = "android_node",
        description: String = "Nodo Centinela Sensor Exterior",
        latitude: Double? = null,
        longitude: Double? = null
    ): RegisterResult = withContext(Dispatchers.IO) {
        val url = "${serverUrl.trimEnd('/')}/api/devices/register-node"
        val payload = JSONObject().apply {
            put("deviceIdentifier", identifier)
            put("identifier", identifier)
            put("name", name)
            put("model", "Android Centinela")
            put("osVersion", "Android ${android.os.Build.VERSION.RELEASE}")
            put("appVersion", "1.0.0")
            if (latitude != null) put("latitude", latitude)
            if (longitude != null) put("longitude", longitude)
        }

        val request = Request.Builder()
            .url(url)
            .post(payload.toString().toRequestBody(JSON_MEDIA_TYPE))
            .build()

        try {
            client.newCall(request).execute().use { response ->
                val bodyStr = response.body?.string().orEmpty()
                if (response.isSuccessful) {
                    val json = JSONObject(bodyStr)
                    val dataObj = json.optJSONObject("data")?.optJSONObject("device")
                    val isAuth = json.optBoolean("isAuthorized", dataObj?.optBoolean("isAuthorized", false) ?: false)
                    val st = json.optString("status", dataObj?.optString("status", "pending_authorization") ?: "pending_authorization")
                    RegisterResult(true, isAuth, st, json.optString("message", "Registro enviado"))
                } else {
                    val errJson = runCatching { JSONObject(bodyStr) }.getOrNull()
                    val msg = errJson?.optString("error") ?: errJson?.optString("message") ?: "Error HTTP ${response.code}"
                    RegisterResult(false, false, "error", msg)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error registering node at $url", e)
            RegisterResult(false, false, "network_error", e.localizedMessage ?: "Error de conexión")
        }
    }

    suspend fun checkNodeStatus(
        serverUrl: String,
        identifier: String
    ): NodeStatusResult = withContext(Dispatchers.IO) {
        val url = "${serverUrl.trimEnd('/')}/api/devices/node-status/$identifier"
        val request = Request.Builder()
            .url(url)
            .get()
            .build()

        try {
            client.newCall(request).execute().use { response ->
                val bodyStr = response.body?.string().orEmpty()
                if (response.isSuccessful) {
                    val json = JSONObject(bodyStr)
                    val dataObj = json.optJSONObject("data") ?: json
                    val isAuth = dataObj.optBoolean("isAuthorized", false)
                    val st = dataObj.optString("status", "pending_authorization")
                    val apiKey = dataObj.optString("apiKey", "").takeIf { it.isNotEmpty() }
                    NodeStatusResult(true, isAuth, st, apiKey)
                } else {
                    val errJson = runCatching { JSONObject(bodyStr) }.getOrNull()
                    val msg = errJson?.optString("error") ?: errJson?.optString("message") ?: "Error HTTP ${response.code}"
                    NodeStatusResult(false, false, "unknown", null, msg)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking status at $url", e)
            NodeStatusResult(false, false, "network_error", null, e.localizedMessage ?: "Error de red")
        }
    }

    suspend fun sendHeartbeat(
        serverUrl: String,
        apiKey: String,
        identifier: String,
        batteryLevel: Int,
        isCharging: Boolean,
        batteryTemp: Double,
        cpuTemp: Double? = null,
        latitude: Double? = null,
        longitude: Double? = null,
        metadata: JSONObject? = null
    ): HeartbeatResult = withContext(Dispatchers.IO) {
        val url = "${serverUrl.trimEnd('/')}/api/heartbeat"
        val payload = JSONObject().apply {
            put("batteryLevel", batteryLevel)
            put("isCharging", isCharging)
            put("batteryTemperature", batteryTemp)
            if (cpuTemp != null) put("cpuTemperature", cpuTemp)
            if (latitude != null) put("latitude", latitude)
            if (longitude != null) put("longitude", longitude)
            put("deviceIdentifier", identifier)
            put("apiKey", apiKey)
            put("metadata", metadata ?: JSONObject().apply {
                put("app", "Centinela")
                put("version", "1.0")
            })
        }

        val request = Request.Builder()
            .url(url)
            .addHeader("x-api-key", apiKey)
            .addHeader("api-key", apiKey)
            .addHeader("x-device-identifier", identifier)
            .addHeader("Authorization", "Bearer $apiKey")
            .post(payload.toString().toRequestBody(JSON_MEDIA_TYPE))
            .build()


        try {
            client.newCall(request).execute().use { response ->
                val bodyStr = response.body?.string().orEmpty()
                if (response.isSuccessful) {
                    val json = runCatching { JSONObject(bodyStr) }.getOrNull()
                    val configObj = json?.optJSONObject("config")
                    val photoInterval = if (configObj?.has("photoIntervalMinutes") == true) configObj.getInt("photoIntervalMinutes") else null
                    val threshold = if (configObj?.has("movementThreshold") == true) configObj.getDouble("movementThreshold").toFloat() else null
                    val isMuted = if (configObj?.has("isMuted") == true) configObj.getBoolean("isMuted") else null
                    val cmdList = mutableListOf<String>()
                    val cmdsArray = json?.optJSONArray("commands")
                    if (cmdsArray != null) {
                        for (i in 0 until cmdsArray.length()) {
                            val c = cmdsArray.optString(i)
                            if (c.isNotEmpty()) cmdList.add(c)
                        }
                    }
                    HeartbeatResult(true, photoInterval, threshold, isMuted, cmdList)
                } else {
                    HeartbeatResult(false)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Heartbeat failed", e)
            HeartbeatResult(false)
        }
    }

    suspend fun sendTelemetry(
        serverUrl: String,
        apiKey: String,
        identifier: String,
        type: String,
        source: String,
        value: Double,
        unit: String,
        status: String = "info",
        data: JSONObject? = null,
        latitude: Double? = null,
        longitude: Double? = null
    ): Boolean = withContext(Dispatchers.IO) {
        val url = "${serverUrl.trimEnd('/')}/api/telemetry"
        val payload = JSONObject().apply {
            put("type", type)
            put("source", source)
            put("value", value)
            put("unit", unit)
            put("status", status)
            put("magnitude", value)
            put("accelMagnitude", value)

            val ax = data?.optDouble("ax", 0.0) ?: 0.0
            val ay = data?.optDouble("ay", 0.0) ?: 0.0
            val az = data?.optDouble("az", 9.81) ?: 9.81
            put("accelX", ax)
            put("accelY", ay)
            put("accelZ", az)
            put("ax", ax)
            put("ay", ay)
            put("az", az)

            put("deviceIdentifier", identifier)
            put("apiKey", apiKey)

            if (data != null) put("data", data)
            if (latitude != null) put("latitude", latitude)
            if (longitude != null) put("longitude", longitude)
        }

        val request = Request.Builder()
            .url(url)
            .addHeader("x-api-key", apiKey)
            .addHeader("api-key", apiKey)
            .addHeader("x-device-identifier", identifier)
            .addHeader("Authorization", "Bearer $apiKey")
            .post(payload.toString().toRequestBody(JSON_MEDIA_TYPE))
            .build()


        try {
            client.newCall(request).execute().use { response ->
                response.isSuccessful
            }
        } catch (e: Exception) {
            Log.e(TAG, "Telemetry sending failed", e)
            false
        }
    }

    suspend fun uploadEvidence(
        serverUrl: String,
        apiKey: String,
        identifier: String,
        jpegBytes: ByteArray,
        latitude: Double? = null,
        longitude: Double? = null,
        triggerType: String = "flood_monitor",
        notes: String = "Captura periódica nodo Centinela",
        simulateFlood: Boolean = false
    ): EvidenceUploadResult = withContext(Dispatchers.IO) {
        val url = "${serverUrl.trimEnd('/')}/api/evidence/upload"

        val filename = "centinela_capture_${System.currentTimeMillis()}.jpg"
        val imageBody = jpegBytes.toRequestBody(JPEG_MEDIA_TYPE)

        val multipartBuilder = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("deviceIdentifier", identifier)
            .addFormDataPart("triggerType", triggerType)
            .addFormDataPart("notes", notes)
            .addFormDataPart("photo", filename, imageBody)
            .addFormDataPart("apiKey", apiKey)

        if (simulateFlood) {
            multipartBuilder.addFormDataPart("simulateFlood", "true")
        }

        if (latitude != null) multipartBuilder.addFormDataPart("latitude", latitude.toString())
        if (longitude != null) multipartBuilder.addFormDataPart("longitude", longitude.toString())

        val request = Request.Builder()
            .url(url)
            .addHeader("x-api-key", apiKey)
            .addHeader("api-key", apiKey)
            .addHeader("x-device-identifier", identifier)
            .addHeader("Authorization", "Bearer $apiKey")
            .post(multipartBuilder.build())
            .build()


        try {
            client.newCall(request).execute().use { response ->
                val bodyStr = response.body?.string().orEmpty()
                if (response.isSuccessful) {
                    val json = JSONObject(bodyStr)
                    val evidence = json.optJSONObject("evidence") ?: json.optJSONObject("data")?.optJSONObject("evidence")
                    val flood = json.optJSONObject("data")?.optJSONObject("floodAnalysis") ?: evidence
                    val isFlood = evidence?.optBoolean("floodDetected", false) ?: flood?.optBoolean("floodDetected", false) ?: false

                    EvidenceUploadResult(
                        success = true,
                        evidenceId = evidence?.optInt("id"),
                        floodDetected = isFlood,
                        waterLevelCm = if (evidence?.has("waterLevelCm") == true) evidence.optDouble("waterLevelCm") else flood?.optDouble("waterLevelCm"),
                        severity = evidence?.optString("severity") ?: flood?.optString("severity"),
                        message = json.optString("message", "Evidencia subida")
                    )
                } else {
                    val errJson = runCatching { JSONObject(bodyStr) }.getOrNull()
                    val msg = errJson?.optString("message") ?: "Error HTTP ${response.code}"
                    EvidenceUploadResult(false, null, false, null, null, msg)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Evidence upload failed", e)
            EvidenceUploadResult(false, null, false, null, null, e.localizedMessage ?: "Error de conexión")
        }
    }

    suspend fun pollCommands(
        serverUrl: String,
        apiKey: String,
        identifier: String
    ): List<String> = withContext(Dispatchers.IO) {
        val url = "${serverUrl.trimEnd('/')}/api/devices/commands"
        val request = Request.Builder()
            .url(url)
            .addHeader("x-api-key", apiKey)
            .addHeader("api-key", apiKey)
            .addHeader("x-device-identifier", identifier)
            .addHeader("Authorization", "Bearer $apiKey")
            .get()
            .build()

        try {
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    val bodyStr = response.body?.string().orEmpty()
                    val json = runCatching { JSONObject(bodyStr) }.getOrNull()
                    val arr = json?.optJSONArray("commands")
                    val list = mutableListOf<String>()
                    if (arr != null) {
                        for (i in 0 until arr.length()) {
                            list.add(arr.getString(i))
                        }
                    }
                    list
                } else {
                    emptyList()
                }
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    suspend fun toggleMute(
        serverUrl: String,
        apiKey: String,
        isMuted: Boolean? = null
    ): Pair<Boolean, Boolean> = withContext(Dispatchers.IO) {
        val url = "${serverUrl.trimEnd('/')}/api/devices/self/mute"
        val payload = JSONObject().apply {
            if (isMuted != null) put("isMuted", isMuted)
        }

        val request = Request.Builder()
            .url(url)
            .patch(payload.toString().toRequestBody(JSON_MEDIA_TYPE))
            .addHeader("x-api-key", apiKey)
            .addHeader("api-key", apiKey)
            .addHeader("Authorization", "Bearer $apiKey")
            .build()

        try {
            client.newCall(request).execute().use { response ->
                val bodyStr = response.body?.string().orEmpty()
                if (response.isSuccessful) {
                    val json = JSONObject(bodyStr)
                    val newMuted = json.optBoolean("isMuted", false)
                    Pair(true, newMuted)
                } else {
                    Pair(false, false)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error toggling mute at $url", e)
            Pair(false, false)
        }
    }
}

