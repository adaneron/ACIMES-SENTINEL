package com.example.centinela

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import com.example.centinela.data.CentinelaPrefs
import com.example.centinela.service.CentinelaService
import com.example.centinela.theme.CentinelaTheme
import com.example.centinela.ui.active.ActiveNodeScreen
import com.example.centinela.ui.registration.RegistrationScreen

class MainActivity : ComponentActivity() {

    private lateinit var prefs: CentinelaPrefs

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = CentinelaPrefs(this)

        enableEdgeToEdge()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        @Suppress("DEPRECATION")
        window.addFlags(
            android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
            android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
            android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        )

        setContent {
            CentinelaTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    var isAuthorized by remember {
                        mutableStateOf(prefs.isAuthorized && prefs.apiKey.isNotEmpty())
                    }

                    // Request runtime permissions on launch
                    val permissionsToRequest = buildList {
                        add(Manifest.permission.CAMERA)
                        add(Manifest.permission.ACCESS_FINE_LOCATION)
                        add(Manifest.permission.ACCESS_COARSE_LOCATION)
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            add(Manifest.permission.POST_NOTIFICATIONS)
                        }
                    }

                    val permissionLauncher = rememberLauncherForActivityResult(
                        ActivityResultContracts.RequestMultiplePermissions()
                    ) { permissionsMap ->
                        // If authorized and permissions granted, ensure service is running
                        if (isAuthorized) {
                            CentinelaService.start(this@MainActivity)
                        }
                    }

                    LaunchedEffect(Unit) {
                        val missingPermissions = permissionsToRequest.filter { perm ->
                            ContextCompat.checkSelfPermission(this@MainActivity, perm) != PackageManager.PERMISSION_GRANTED
                        }
                        if (missingPermissions.isNotEmpty()) {
                            permissionLauncher.launch(missingPermissions.toTypedArray())
                        } else if (isAuthorized) {
                            CentinelaService.start(this@MainActivity)
                        }
                    }

                    if (isAuthorized) {
                        ActiveNodeScreen(
                            prefs = prefs,
                            onUnlink = {
                                isAuthorized = false
                            }
                        )
                    } else {
                        RegistrationScreen(
                            prefs = prefs,
                            onAuthorized = {
                                isAuthorized = true
                                CentinelaService.start(this@MainActivity)
                            }
                        )
                    }
                }
            }
        }
    }
}
