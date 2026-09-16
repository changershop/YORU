package com.example.yoru.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.yoru.ui.theme.*

sealed class BottomNavItem(
    val route: String,
    val title: String,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector
) {
    object Home : BottomNavItem("home", "Home", Icons.Filled.Home, Icons.Outlined.Home)
    object Browse : BottomNavItem("browse", "Browse", Icons.Filled.Explore, Icons.Outlined.Explore)
    object Watchlist : BottomNavItem("watchlist", "Watchlist", Icons.Filled.Bookmark, Icons.Outlined.BookmarkBorder)
    object Community : BottomNavItem("community", "Community", Icons.Filled.Forum, Icons.Outlined.Forum)
    object Profile : BottomNavItem("profile", "Profile", Icons.Filled.Person, Icons.Outlined.Person)
}

@Composable
fun YoruBottomNav(
    currentRoute: String,
    onNavigate: (String) -> Unit
) {
    val items = listOf(
        BottomNavItem.Home,
        BottomNavItem.Browse,
        BottomNavItem.Watchlist,
        BottomNavItem.Community,
        BottomNavItem.Profile
    )

    NavigationBar(
        modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .testTag("bottom_nav"),
        containerColor = YoruSurface,
        contentColor = YoruTextPrimary,
        tonalElevation = 8.dp
    ) {
        items.forEach { item ->
            val isSelected = currentRoute == item.route
            NavigationBarItem(
                selected = isSelected,
                onClick = { onNavigate(item.route) },
                icon = {
                    Icon(
                        imageVector = if (isSelected) item.selectedIcon else item.unselectedIcon,
                        contentDescription = item.title,
                        tint = if (isSelected) YoruIndigoPrimary else YoruTextMuted,
                        modifier = Modifier.size(24.dp)
                    )
                },
                label = {
                    Text(
                        text = item.title,
                        fontSize = 11.sp,
                        color = if (isSelected) YoruIndigoPrimary else YoruTextMuted
                    )
                },
                colors = NavigationBarItemDefaults.colors(
                    indicatorColor = YoruSurfaceElevated
                ),
                modifier = Modifier.testTag("nav_tab_${item.route}")
            )
        }
    }
}
