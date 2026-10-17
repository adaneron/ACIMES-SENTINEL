package com.example.centinela.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val TacticalColorScheme = darkColorScheme(
    primary = CyanPrimary,
    onPrimary = Color.Black,
    primaryContainer = Color(0xFF0E3A52),
    onPrimaryContainer = CyanGlow,
    secondary = EmeraldOperational,
    onSecondary = Color.Black,
    secondaryContainer = Color(0xFF064E3B),
    onSecondaryContainer = EmeraldOperational,
    tertiary = AmberWarning,
    onTertiary = Color.Black,
    background = TacticalDarkBg,
    onBackground = SlateTextPrimary,
    surface = TacticalSurface,
    onSurface = SlateTextPrimary,
    surfaceVariant = TacticalSurfaceVariant,
    onSurfaceVariant = SlateTextSecondary,
    error = RedEmergency,
    onError = Color.White
)

@Composable
fun CentinelaTheme(
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = TacticalColorScheme,
        typography = Typography,
        content = content
    )
}

