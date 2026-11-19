package app.plainpage.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

object Palette {
    val accent = Color(0xFF0E6F64)
    val device = Color(0xFF0B6B50)
    val deviceSoft = Color(0xFFD9EFE5)
    val cloud = Color(0xFF3A49C9)
    val cloudSoft = Color(0xFFE3E6FA)
    val warn = Color(0xFF8A5200)
    val warnSoft = Color(0xFFFBEBCF)
    val error = Color(0xFFA4262C)
    val errorSoft = Color(0xFFFBE3E1)
    val highlight = Color(0xFFFBEBCF)
}

private val Light = lightColorScheme(
    primary = Palette.accent,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDCEEEA),
    background = Color(0xFFFAF5EA),
    surface = Color(0xFFFFFDF8),
    surfaceVariant = Color(0xFFF2EBDB),
    onBackground = Color(0xFF1E2530),
    onSurface = Color(0xFF1E2530),
    onSurfaceVariant = Color(0xFF5A6372),
    outline = Color(0xFFE2D7C1),
)

private val Dark = darkColorScheme(
    primary = Color(0xFF4FC4B0),
    onPrimary = Color(0xFF06211D),
    primaryContainer = Color(0xFF16332E),
    background = Color(0xFF14171C),
    surface = Color(0xFF1C2027),
    surfaceVariant = Color(0xFF262B34),
    onBackground = Color(0xFFECE8DF),
    onSurface = Color(0xFFECE8DF),
    onSurfaceVariant = Color(0xFFA3AAB6),
    outline = Color(0xFF323946),
)

@Composable
fun PlainPageTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) Dark else Light, content = content)
}
