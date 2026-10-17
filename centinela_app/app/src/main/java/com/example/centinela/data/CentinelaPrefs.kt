package com.example.centinela.data

import android.content.Context
import android.content.SharedPreferences
import java.util.UUID

class CentinelaPrefs(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("centinela_prefs", Context.MODE_PRIVATE)

    companion object {
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_IDENTIFIER = "device_identifier"
        private const val KEY_DEVICE_NAME = "device_name"
        private const val KEY_DESCRIPTION = "device_description"
        private const val KEY_API_KEY = "api_key"
        private const val KEY_IS_AUTHORIZED = "is_authorized"
        private const val KEY_STATUS = "status"
        private const val KEY_PHOTO_INTERVAL_MIN = "photo_interval_min"
        private const val KEY_HEARTBEAT_INTERVAL_SEC = "heartbeat_interval_sec"
        private const val KEY_SEISMIC_THRESHOLD = "seismic_threshold"
        private const val KEY_SERVICE_ACTIVE = "service_active"
        private const val KEY_IS_MUTED = "is_muted"

        const val DEFAULT_SERVER_URL = "https://sentinel.adaneitor.com"
        const val DEFAULT_PHOTO_INTERVAL_MIN = 3
        const val DEFAULT_HEARTBEAT_INTERVAL_SEC = 30
        const val DEFAULT_SEISMIC_THRESHOLD = 14.5f
    }

    var serverUrl: String
        get() = prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL) ?: DEFAULT_SERVER_URL
        set(value) = prefs.edit().putString(KEY_SERVER_URL, value.trimEnd('/')).apply()

    var deviceIdentifier: String
        get() {
            var id = prefs.getString(KEY_IDENTIFIER, null)
            if (id.isNullOrEmpty()) {
                val shortUuid = UUID.randomUUID().toString().substring(0, 8)
                id = "node-centinela-$shortUuid"
                prefs.edit().putString(KEY_IDENTIFIER, id).apply()
            }
            return id
        }
        set(value) = prefs.edit().putString(KEY_IDENTIFIER, value.trim()).apply()

    var deviceName: String
        get() {
            var name = prefs.getString(KEY_DEVICE_NAME, null)
            if (name.isNullOrEmpty()) {
                val shortSuffix = deviceIdentifier.takeLast(4).uppercase()
                name = "Centinela Nodo $shortSuffix"
                prefs.edit().putString(KEY_DEVICE_NAME, name).apply()
            }
            return name
        }
        set(value) = prefs.edit().putString(KEY_DEVICE_NAME, value.trim()).apply()

    var isMuted: Boolean
        get() = prefs.getBoolean(KEY_IS_MUTED, false)
        set(value) = prefs.edit().putBoolean(KEY_IS_MUTED, value).apply()

    var description: String
        get() = prefs.getString(KEY_DESCRIPTION, "Nodo Centinela Sensor con Cámara") ?: "Nodo Centinela Sensor con Cámara"
        set(value) = prefs.edit().putString(KEY_DESCRIPTION, value.trim()).apply()

    var apiKey: String
        get() = prefs.getString(KEY_API_KEY, "") ?: ""
        set(value) = prefs.edit().putString(KEY_API_KEY, value.trim()).apply()

    var isAuthorized: Boolean
        get() = prefs.getBoolean(KEY_IS_AUTHORIZED, false)
        set(value) = prefs.edit().putBoolean(KEY_IS_AUTHORIZED, value).apply()

    var status: String
        get() = prefs.getString(KEY_STATUS, "unregistered") ?: "unregistered"
        set(value) = prefs.edit().putString(KEY_STATUS, value).apply()

    var photoIntervalMinutes: Int
        get() = prefs.getInt(KEY_PHOTO_INTERVAL_MIN, DEFAULT_PHOTO_INTERVAL_MIN)
        set(value) = prefs.edit().putInt(KEY_PHOTO_INTERVAL_MIN, value).apply()

    var heartbeatIntervalSeconds: Int
        get() = prefs.getInt(KEY_HEARTBEAT_INTERVAL_SEC, DEFAULT_HEARTBEAT_INTERVAL_SEC)
        set(value) = prefs.edit().putInt(KEY_HEARTBEAT_INTERVAL_SEC, value).apply()

    var seismicThreshold: Float
        get() = prefs.getFloat(KEY_SEISMIC_THRESHOLD, DEFAULT_SEISMIC_THRESHOLD)
        set(value) = prefs.edit().putFloat(KEY_SEISMIC_THRESHOLD, value).apply()

    var isServiceActive: Boolean
        get() = prefs.getBoolean(KEY_SERVICE_ACTIVE, false)
        set(value) = prefs.edit().putBoolean(KEY_SERVICE_ACTIVE, value).apply()

    fun clearAuth() {
        prefs.edit()
            .remove(KEY_API_KEY)
            .putBoolean(KEY_IS_AUTHORIZED, false)
            .putString(KEY_STATUS, "unregistered")
            .apply()
    }
}
