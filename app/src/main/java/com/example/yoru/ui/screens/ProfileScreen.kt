package com.example.yoru.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.yoru.data.local.WatchHistoryEntity
import com.example.yoru.ui.theme.*

@Composable
fun ProfileScreen(
    watchHistory: List<WatchHistoryEntity>,
    watchlistCount: Int,
    onClearHistory: () -> Unit,
    onHistoryItemClick: (String, Int) -> Unit
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(YoruBackground)
            .statusBarsPadding()
            .testTag("profile_screen"),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 90.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // User Profile Header Card
        item {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("profile_header_card"),
                colors = CardDefaults.cardColors(containerColor = YoruSurfaceElevated),
                shape = RoundedCornerShape(16.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(72.dp)
                            .clip(RoundedCornerShape(36.dp))
                            .background(YoruIndigoPrimary),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "夜",
                            color = Color.White,
                            fontWeight = FontWeight.Black,
                            fontSize = 32.sp
                        )
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text(
                                text = "ShinobiOtaku",
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.ExtraBold,
                                color = YoruTextPrimary
                            )
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(YoruIndigoPrimary.copy(alpha = 0.2f))
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = "VIP",
                                    color = YoruIndigoPrimary,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Black
                                )
                            }
                        }

                        Text(
                            text = "Member since Fall 2024",
                            style = MaterialTheme.typography.bodySmall,
                            color = YoruTextMuted
                        )

                        Text(
                            text = "Level 28 • Master Streamer",
                            fontSize = 12.sp,
                            color = YoruScoreGold,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }
        }

        // Stats Row
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                StatCard(
                    modifier = Modifier.weight(1f),
                    title = "Watched",
                    value = "${124 + watchHistory.size}",
                    icon = Icons.Default.Visibility
                )
                StatCard(
                    modifier = Modifier.weight(1f),
                    title = "Watchlist",
                    value = "$watchlistCount",
                    icon = Icons.Default.Bookmark
                )
                StatCard(
                    modifier = Modifier.weight(1f),
                    title = "Posts",
                    value = "16",
                    icon = Icons.Default.Forum
                )
            }
        }

        // Badges Section
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = YoruSurfaceElevated),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = "Unlocked Badges",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = YoruTextPrimary
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        BadgeItem(name = "Night Owl", icon = "🌙", color = "#4F46E5")
                        BadgeItem(name = "Early Bird", icon = "⚡", color = "#10B981")
                        BadgeItem(name = "Critic", icon = "✍️", color = "#F59E0B")
                        BadgeItem(name = "Marathon", icon = "🏆", color = "#EC4899")
                    }
                }
            }
        }

        // Watch History Section Header
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Watch History (${watchHistory.size})",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = YoruTextPrimary
                )
                if (watchHistory.isNotEmpty()) {
                    TextButton(
                        onClick = onClearHistory,
                        modifier = Modifier.testTag("clear_history_btn")
                    ) {
                        Text("Clear All", color = YoruErrorRed, fontSize = 12.sp)
                    }
                }
            }
        }

        // History items
        if (watchHistory.isEmpty()) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(text = "No watch history recorded yet.", color = YoruTextMuted, fontSize = 13.sp)
                }
            }
        } else {
            items(watchHistory) { item ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onHistoryItemClick(item.slug, item.episodeNumber) },
                    colors = CardDefaults.cardColors(containerColor = YoruSurfaceElevated),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = item.title,
                                fontWeight = FontWeight.Bold,
                                color = YoruTextPrimary,
                                fontSize = 14.sp
                            )
                            Text(
                                text = "Episode ${item.episodeNumber}",
                                color = YoruIndigoPrimary,
                                fontSize = 12.sp
                            )
                        }

                        Icon(
                            imageVector = Icons.Default.PlayArrow,
                            contentDescription = "Resume",
                            tint = Color.White
                        )
                    }
                }
            }
        }

        // App & System Info
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = YoruSurfaceElevated),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(text = "App Information", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = YoruTextPrimary)
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(text = "Platform", color = YoruTextMuted, fontSize = 12.sp)
                        Text(text = "Remix YORU Android v1.0", color = YoruTextPrimary, fontSize = 12.sp)
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(text = "Streaming Protocol", color = YoruTextMuted, fontSize = 12.sp)
                        Text(text = "HLS Adaptive 1080p", color = YoruTextPrimary, fontSize = 12.sp)
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(text = "Cache Engine", color = YoruTextMuted, fontSize = 12.sp)
                        Text(text = "Room SQLite Local DB", color = YoruTextPrimary, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@Composable
fun StatCard(
    modifier: Modifier = Modifier,
    title: String,
    value: String,
    icon: ImageVector
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = YoruSurfaceElevated),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(imageVector = icon, contentDescription = null, tint = YoruIndigoPrimary, modifier = Modifier.size(20.dp))
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = YoruTextPrimary)
            Text(text = title, style = MaterialTheme.typography.bodySmall, color = YoruTextMuted, fontSize = 11.sp)
        }
    }
}

@Composable
fun BadgeItem(name: String, icon: String, color: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(22.dp))
                .background(YoruBackground),
            contentAlignment = Alignment.Center
        ) {
            Text(text = icon, fontSize = 20.sp)
        }
        Spacer(modifier = Modifier.height(4.dp))
        Text(text = name, fontSize = 11.sp, color = YoruTextMuted, fontWeight = FontWeight.Medium)
    }
}
