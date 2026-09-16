package com.example.yoru.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val YoruDarkColorScheme = darkColorScheme(
    primary = YoruIndigoPrimary,
    onPrimary = YoruTextPrimary,
    primaryContainer = YoruIndigoPrimary.copy(alpha = 0.2f),
    onPrimaryContainer = YoruTextPrimary,
    secondary = YoruVioletAccent,
    onSecondary = YoruTextPrimary,
    background = YoruBackground,
    onBackground = YoruTextPrimary,
    surface = YoruSurface,
    onSurface = YoruTextPrimary,
    surfaceVariant = YoruSurfaceElevated,
    onSurfaceVariant = YoruTextMuted,
    outline = YoruCardBorder,
    error = YoruErrorRed,
    onError = YoruTextPrimary
)

@Composable
fun RemixYORUTheme(
    content: @Composable () -> Unit
) {
    val colorScheme = YoruDarkColorScheme
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = YoruBackground.toArgb()
            window.navigationBarColor = YoruBackground.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
            WindowCompat.getInsetsController(window, view).isAppearanceLightNavigationBars = false
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = YoruTypography,
        content = content
    )
}
