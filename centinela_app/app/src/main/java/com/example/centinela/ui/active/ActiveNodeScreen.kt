package com.example.centinela.ui.active

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.centinela.R
import com.example.centinela.data.CentinelaPrefs
import com.example.centinela.service.CentinelaService
import com.example.centinela.data.CentinelaApi
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun ActiveNodeScreen(
    prefs: CentinelaPrefs,
    onUnlink: () -> Unit
) {
    val context = LocalContext.current
    val liveState by CentinelaService.liveState.collectAsState()
    val scrollState = rememberScrollState()
    val scope = rememberCoroutineScope()
    val api = remember { CentinelaApi() }

    var isMuted by remember { mutableStateOf(prefs.isMuted) }

    val timeFormat = remember { SimpleDateFormat("HH:mm:ss", Locale.getDefault()) }

    var isBatteryOptIgnored by remember {
        mutableStateOf(checkBatteryOptimization(context))
    }

    LaunchedEffect(liveState.lastHeartbeatTime) {
        if (isMuted != prefs.isMuted) {
            isMuted = prefs.isMuted
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        // Fondo con patrón ACIMES
        Image(
            painter = painterResource(id = R.drawable.acimes_pattern),
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop
        )
        // Capa táctica oscura
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xF406090F))
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
                .verticalScroll(scrollState)
        ) {
            Spacer(modifier = Modifier.height(8.dp))

            // Header de Marca ACIMES | SENTINEL
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 12.dp)
            ) {
                Image(
                    painter = painterResource(id = R.drawable.acimes_logo),
                    contentDescription = "ACIMES Logo",
                    modifier = Modifier.size(46.dp)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = "ACIMES",
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Black,
                            color = Color(0xFF22D3EE),
                            letterSpacing = 1.sp
                        )
                        Text(
                            text = " | SENTINEL",
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                    }
                    Text(
                        text = "Nodo Autónomo de Telemetría",
                        fontSize = 11.sp,
                        color = Color(0xFF94A3B8)
                    )
                }
            }

        // Status Header Card Táctico
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            shape = RoundedCornerShape(16.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF334155))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(12.dp)
                                .background(
                                    if (liveState.isRunning) Color(0xFF10B981) else Color(0xFFEF4444),
                                    CircleShape
                                )
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = if (liveState.isRunning) "NODO ACTIVO & OPERACIONAL" else "SERVICIO DETENIDO",
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp,
                            color = if (liveState.isRunning) Color(0xFF10B981) else Color(0xFFEF4444)
                        )
                    }

                    Surface(
                        color = MaterialTheme.colorScheme.primaryContainer,
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            text = "AUTORIZADO",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                Text(
                    text = prefs.deviceName,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = "ID: ${prefs.deviceIdentifier}",
                    fontSize = 12.sp,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = "Servidor: ${prefs.serverUrl}",
                    fontSize = 12.sp,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.primary
                )

                Spacer(modifier = Modifier.height(12.dp))

                // Estado de Transmisión / Mute
                Surface(
                    color = if (isMuted) Color(0x33F59E0B) else Color(0x3310B981),
                    shape = RoundedCornerShape(8.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, if (isMuted) Color(0xFFF59E0B) else Color(0xFF10B981)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = if (isMuted) "🔇 ALERTAS SILENCIADAS (PAUSA)" else "🔔 TRANSMISIÓN ACTIVA EN VIVO",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                            color = if (isMuted) Color(0xFFFBBF24) else Color(0xFF34D399)
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Accelerometer / Seismic Card
        val isSeismicAlert = liveState.currentAccMagnitude >= prefs.seismicThreshold
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = if (isSeismicAlert) Color(0x33EF4444) else MaterialTheme.colorScheme.surface
            ),
            shape = RoundedCornerShape(16.dp),
            border = if (isSeismicAlert) androidx.compose.foundation.BorderStroke(2.dp, Color(0xFFEF4444)) else null
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "📡 Acelerómetro Triaxial",
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "Umbral: ${String.format("%.1f", prefs.seismicThreshold)} m/s²",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    SensorMetricBox(label = "X", value = String.format("%.2f", liveState.currentAccX))
                    SensorMetricBox(label = "Y", value = String.format("%.2f", liveState.currentAccY))
                    SensorMetricBox(label = "Z", value = String.format("%.2f", liveState.currentAccZ))
                    SensorMetricBox(
                        label = "Magnitud",
                        value = String.format("%.2f", liveState.currentAccMagnitude),
                        isHighlight = isSeismicAlert
                    )
                }

                AnimatedVisibility(visible = liveState.lastSeismicAlert != null) {
                    liveState.lastSeismicAlert?.let { alert ->
                        Spacer(modifier = Modifier.height(12.dp))
                        Surface(
                            color = Color(0xFFFEE2E2),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = "⚠️ $alert",
                                color = Color(0xFFB91C1C),
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp,
                                modifier = Modifier.padding(8.dp)
                            )
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Hardware & GPS Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "🔋 Hardware y Posición",
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                    color = MaterialTheme.colorScheme.onSurface
                )

                Spacer(modifier = Modifier.height(12.dp))

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column {
                        Text(text = "Batería", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(
                            text = "${liveState.batteryLevel}% ${if (liveState.isCharging) "⚡ (Cargando)" else ""}",
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 14.sp
                        )
                    }

                    Column {
                        Text(text = "Temperatura", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(
                            text = "${String.format("%.1f", liveState.batteryTemp)} °C",
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 14.sp
                        )
                    }

                    Column {
                        Text(text = "GPS", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(
                            text = if (liveState.latitude != null && liveState.longitude != null)
                                "${String.format("%.4f", liveState.latitude)}, ${String.format("%.4f", liveState.longitude)}"
                            else "Buscando...",
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 14.sp
                        )
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                val hbTime = if (liveState.lastHeartbeatTime > 0) timeFormat.format(Date(liveState.lastHeartbeatTime)) else "Pendiente"
                Text(
                    text = "Último Heartbeat: $hbTime ${if (liveState.lastHeartbeatSuccess == true) "✅ OK" else ""}",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Camera & Flood Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "📷 Monitoreo de Inundaciones con IA",
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    if (liveState.isTakingPhoto) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = "Captura autónoma cada ${prefs.photoIntervalMinutes} min (pantalla apagada o activa).",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Spacer(modifier = Modifier.height(8.dp))

                val photoTime = if (liveState.lastPhotoTime > 0) timeFormat.format(Date(liveState.lastPhotoTime)) else "Ninguna aún"
                Text(
                    text = "Última Foto: $photoTime",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium
                )

                liveState.lastPhotoStatus?.let { status ->
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = status,
                        fontSize = 13.sp,
                        color = if (status.contains("Inundación")) Color(0xFFEF4444) else MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        // Quick Actions
        Text(
            text = "Acciones de Prueba Inmediata",
            fontWeight = FontWeight.Bold,
            fontSize = 16.sp,
            color = MaterialTheme.colorScheme.onSurface
        )

        Spacer(modifier = Modifier.height(8.dp))

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = { CentinelaService.triggerEarthquakeAlert(context) },
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626)),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.weight(1f)
            ) {
                Text("💥 Simular Sismo", fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }

            Button(
                onClick = { CentinelaService.triggerFloodAlert(context) },
                enabled = !liveState.isTakingPhoto,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = if (liveState.isTakingPhoto) "Analizando..." else "🌊 Simular Inundación",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = { CentinelaService.triggerPhoto(context) },
                enabled = !liveState.isTakingPhoto,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF4F46E5)),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.weight(1f)
            ) {
                Text(if (liveState.isTakingPhoto) "Tomando..." else "📸 Foto con IA", fontSize = 11.sp)
            }

            OutlinedButton(
                onClick = { CentinelaService.triggerHeartbeat(context) },
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.weight(1f)
            ) {
                Text("💓 Heartbeat", fontSize = 11.sp)
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        OutlinedButton(
            onClick = {
                if (liveState.isRunning) {
                    CentinelaService.stop(context)
                } else {
                    CentinelaService.start(context)
                }
            },
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(if (liveState.isRunning) "⏹️ Pausar Servicio Centinela" else "▶️ Reanudar Servicio Centinela", fontSize = 12.sp)
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Battery Optimization Warning
        if (!isBatteryOptIgnored) {
            Surface(
                color = Color(0xFFFEF3C7),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(
                        text = "⚙️ Optimización de Batería Activa",
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                        color = Color(0xFF92400E)
                    )
                    Text(
                        text = "Para que Centinela tome fotos y reporte sismos 24/7 con la pantalla apagada, deshabilita el ahorro de batería para esta app.",
                        fontSize = 11.sp,
                        color = Color(0xFF78350F)
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Button(
                        onClick = {
                            requestIgnoreBatteryOptimizations(context)
                            isBatteryOptIgnored = checkBatteryOptimization(context)
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD97706)),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text("Excluir de Ahorro de Batería", fontSize = 12.sp)
                    }
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
        }

        // Unlink Node Button
        TextButton(
            onClick = {
                CentinelaService.stop(context)
                prefs.clearAuth()
                onUnlink()
            },
            modifier = Modifier.align(Alignment.CenterHorizontally)
        ) {
            Text("Desvincular Nodo y Volver al Registro", color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
        }

        Spacer(modifier = Modifier.height(24.dp))
    }
}
}

@Composable
fun SensorMetricBox(label: String, value: String, isHighlight: Boolean = false) {
    Surface(
        color = if (isHighlight) Color(0xFFDC2626) else MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = label,
                fontSize = 11.sp,
                color = if (isHighlight) Color.White else MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = value,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
                fontFamily = FontFamily.Monospace,
                color = if (isHighlight) Color.White else MaterialTheme.colorScheme.onSurface
            )
        }
    }
}

private fun checkBatteryOptimization(context: Context): Boolean {
    val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    return powerManager.isIgnoringBatteryOptimizations(context.packageName)
}

@SuppressLint("BatteryLife")
private fun requestIgnoreBatteryOptimizations(context: Context) {
    try {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:${context.packageName}")
        }
        context.startActivity(intent)
    } catch (e: Exception) {
        val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
        context.startActivity(intent)
    }
}
