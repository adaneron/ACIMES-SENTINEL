package com.example.centinela.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.example.centinela.data.CentinelaPrefs
import com.example.centinela.service.CentinelaService

class BootReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "BootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == Intent.ACTION_MY_PACKAGE_REPLACED ||
            intent.action == "android.intent.action.QUICKBOOT_POWERON"
        ) {
            Log.i(TAG, "Reinicio de dispositivo detectado: ${intent.action}")
            val prefs = CentinelaPrefs(context)
            if (prefs.isAuthorized && prefs.apiKey.isNotEmpty()) {
                Log.i(TAG, "Nodo Centinela autorizado, auto-iniciando servicio en segundo plano...")
                CentinelaService.start(context)
            } else {
                Log.i(TAG, "Nodo Centinela no autorizado aún; omitiendo inicio automático")
            }
        }
    }
}
