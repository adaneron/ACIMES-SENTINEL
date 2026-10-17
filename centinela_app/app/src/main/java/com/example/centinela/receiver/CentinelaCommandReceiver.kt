package com.example.centinela.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.example.centinela.data.CentinelaPrefs
import com.example.centinela.service.CentinelaService

class CentinelaCommandReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "CentinelaCmdReceiver"
        const val ACTION_TAKE_PHOTO = "com.example.centinela.action.TAKE_PHOTO"
        const val ACTION_TRIGGER_SEISMIC = "com.example.centinela.action.TRIGGER_SEISMIC"
        const val ACTION_SET_PHOTO_INTERVAL = "com.example.centinela.action.SET_PHOTO_INTERVAL"
        const val ACTION_FORCE_HEARTBEAT = "com.example.centinela.action.FORCE_HEARTBEAT"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        Log.i(TAG, "Comando recibido por broadcast: $action")
        when (action) {
            ACTION_TAKE_PHOTO -> {
                Log.i(TAG, "Ejecutando captura de foto inmediata desde comando broadcast")
                CentinelaService.triggerPhoto(context)
            }
            ACTION_TRIGGER_SEISMIC -> {
                Log.i(TAG, "Ejecutando simulación de sismo desde comando broadcast")
                CentinelaService.triggerEarthquakeAlert(context)
            }
            ACTION_SET_PHOTO_INTERVAL -> {
                val interval = intent.getIntExtra("interval", 3)
                val prefs = CentinelaPrefs(context)
                prefs.photoIntervalMinutes = interval
                Log.i(TAG, "Intervalo de captura actualizado a $interval minutos")
            }
            ACTION_FORCE_HEARTBEAT -> {
                Log.i(TAG, "Forzando heartbeat inmediato")
                CentinelaService.triggerHeartbeat(context)
            }
        }
    }
}
