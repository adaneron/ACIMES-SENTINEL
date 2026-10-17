package com.example.centinela.ui.registration

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.centinela.R
import com.example.centinela.data.CentinelaApi
import com.example.centinela.data.CentinelaPrefs
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

@Composable
fun RegistrationScreen(
    prefs: CentinelaPrefs,
    onAuthorized: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val api = remember { CentinelaApi() }

    var serverUrl by remember { mutableStateOf(prefs.serverUrl) }
    var identifier by remember { mutableStateOf(prefs.deviceIdentifier) }
    var deviceName by remember { mutableStateOf(prefs.deviceName) }
    var description by remember { mutableStateOf(prefs.description) }

    var isPendingApproval by remember { mutableStateOf(prefs.status == "pending_authorization") }
    var isSubmitting by remember { mutableStateOf(false) }
    var statusMessage by remember { mutableStateOf<String?>(null) }
    var isCheckingStatus by remember { mutableStateOf(false) }

    // Polling loop when waiting for admin authorization
    LaunchedEffect(isPendingApproval) {
        if (isPendingApproval) {
            while (isActive) {
                isCheckingStatus = true
                val result = api.checkNodeStatus(serverUrl, identifier)
                isCheckingStatus = false
                if (result.success && result.isAuthorized && !result.apiKey.isNullOrEmpty()) {
                    prefs.apiKey = result.apiKey
                    prefs.isAuthorized = true
                    prefs.status = "online"
                    onAuthorized()
                    break
                }
                delay(3500L)
            }
        }
    }

    val scrollState = rememberScrollState()

    Box(modifier = Modifier.fillMaxSize()) {
        // Fondo con patrón ACIMES
        Image(
            painter = painterResource(id = R.drawable.acimes_pattern),
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop
        )
        // Capa oscura para máxima legibilidad táctica
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xF206090F))
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp)
                .verticalScroll(scrollState),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(20.dp))

            // Logo ACIMES
            Image(
                painter = painterResource(id = R.drawable.acimes_logo),
                contentDescription = "ACIMES Logo",
                modifier = Modifier.size(68.dp)
            )

            Spacer(modifier = Modifier.height(12.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "ACIMES",
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Black,
                    color = Color(0xFF22D3EE),
                    letterSpacing = 2.sp
                )
                Text(
                    text = " | SENTINEL",
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    letterSpacing = 1.sp
                )
            }

            Text(
                text = "Registro de Dispositivo Nodo",
                fontSize = 14.sp,
                color = Color(0xFF94A3B8),
                modifier = Modifier.padding(top = 4.dp, bottom = 20.dp)
            )

            if (isPendingApproval) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                shape = RoundedCornerShape(16.dp)
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(48.dp),
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "⏳ Esperando Autorización",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "El nodo fue registrado con éxito. Un administrador debe autorizarlo en el panel web para comenzar a transmitir telemetría y fotos.",
                        textAlign = TextAlign.Center,
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "Identificador: $identifier\nServidor: $serverUrl",
                        textAlign = TextAlign.Center,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = {
                                scope.launch {
                                    isCheckingStatus = true
                                    val res = api.checkNodeStatus(serverUrl, identifier)
                                    isCheckingStatus = false
                                    if (res.success && res.isAuthorized && !res.apiKey.isNullOrEmpty()) {
                                        prefs.apiKey = res.apiKey
                                        prefs.isAuthorized = true
                                        prefs.status = "online"
                                        onAuthorized()
                                    } else {
                                        statusMessage = "Aún pendiente de aprobación por el admin"
                                    }
                                }
                            },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Verificar")
                        }
                        Button(
                            onClick = {
                                isPendingApproval = false
                                prefs.status = "unregistered"
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Cancelar")
                        }
                    }
                }
            }
        } else {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                shape = RoundedCornerShape(16.dp)
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text(
                        text = "Configuración del Nodo",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(modifier = Modifier.height(16.dp))

                    OutlinedTextField(
                        value = serverUrl,
                        onValueChange = { serverUrl = it },
                        label = { Text("URL del Servidor Principal") },
                        placeholder = { Text("https://sentinel.adaneitor.com") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    OutlinedTextField(
                        value = identifier,
                        onValueChange = { identifier = it },
                        label = { Text("Identificador de Dispositivo") },
                        placeholder = { Text("node-centinela-01") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    OutlinedTextField(
                        value = deviceName,
                        onValueChange = { deviceName = it },
                        label = { Text("Nombre del Nodo") },
                        placeholder = { Text("Centinela Sala Principal") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    OutlinedTextField(
                        value = description,
                        onValueChange = { description = it },
                        label = { Text("Descripción / Ubicación") },
                        placeholder = { Text("Nodo exterior monitoreo quebrada") },
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(modifier = Modifier.height(20.dp))

                    Button(
                        onClick = {
                            isSubmitting = true
                            statusMessage = null
                            prefs.serverUrl = serverUrl
                            prefs.deviceIdentifier = identifier
                            prefs.deviceName = deviceName
                            prefs.description = description

                            scope.launch {
                                val result = api.registerNode(
                                    serverUrl = serverUrl,
                                    identifier = identifier,
                                    name = deviceName,
                                    description = description
                                )
                                isSubmitting = false
                                if (result.success) {
                                    prefs.status = "pending_authorization"
                                    isPendingApproval = true
                                    statusMessage = result.message
                                } else {
                                    statusMessage = "Error: ${result.message}"
                                }
                            }
                        },
                        enabled = !isSubmitting && serverUrl.isNotBlank() && identifier.isNotBlank(),
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        if (isSubmitting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                color = MaterialTheme.colorScheme.onPrimary,
                                strokeWidth = 2.dp
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Enviando Solicitud...")
                        } else {
                            Text("Solicitar Registro de Nodo", fontSize = 16.sp)
                        }
                    }
                }
            }
        }

        AnimatedVisibility(visible = statusMessage != null) {
            statusMessage?.let { msg ->
                val isError = msg.startsWith("Error") || msg.contains("ya está registrado", ignoreCase = true)
                Spacer(modifier = Modifier.height(16.dp))
                Surface(
                    color = if (isError) Color(0x33EF4444) else Color(0x3310B981),
                    shape = RoundedCornerShape(12.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, if (isError) Color(0xFFEF4444) else Color(0xFF10B981)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = if (isError) "⚠️" else "✅",
                            fontSize = 18.sp,
                            modifier = Modifier.padding(end = 10.dp)
                        )
                        Text(
                            text = msg,
                            color = if (isError) Color(0xFFFCA5A5) else Color(0xFF6EE7B7),
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(32.dp))

        Text(
            text = "ℹ️ Este teléfono funcionará como un sensor autónomo sin contraseña de bloqueo, enviando telemetría de sismos, heartbeats periódicos e imágenes para evaluación de inundaciones mediante IA/OCR.",
            fontSize = 12.sp,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
}
