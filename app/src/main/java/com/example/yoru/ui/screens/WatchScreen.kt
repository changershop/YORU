package com.example.yoru.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.example.yoru.data.model.Anime
import com.example.yoru.data.model.CommunityComment
import com.example.yoru.data.model.Episode
import com.example.yoru.ui.theme.*

@Composable
fun WatchScreen(
    anime: Anime,
    episodes: List<Episode>,
    currentEpisodeNumber: Int,
    onBackClick: () -> Unit,
    onSelectEpisode: (Int) -> Unit
) {
    var isPlaying by remember { mutableStateOf(true) }
    var selectedServer by remember { mutableStateOf("HD-1 (Sub)") }
    val servers = listOf("HD-1 (Sub)", "HD-2 (Dub)", "Multi-Stream", "Cloud Stream")

    var commentText by remember { mutableStateOf("") }
    val comments = remember {
        mutableStateListOf(
            CommunityComment("wc1", "watch", "AnimeKage", "", "The soundtrack sync at the 14-minute mark gave me goosebumps!"),
            CommunityComment("wc2", "watch", "Ren", "", "Peak animation right here. YORU video player is so smooth!"),
            CommunityComment("wc3", "watch", "Shinobi99", "", "Can't wait for next week's continuation!")
        )
    }

    val currentEpisode = episodes.find { it.episodeNumber == currentEpisodeNumber }
        ?: episodes.firstOrNull()
        ?: Episode("ep1", anime.id, "s1", currentEpisodeNumber, "Episode $currentEpisodeNumber")

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(YoruBackground)
            .testTag("watch_screen"),
        contentPadding = PaddingValues(bottom = 80.dp)
    ) {
        // Player Header Bar
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(
                    onClick = onBackClick,
                    modifier = Modifier.testTag("watch_back_btn")
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Back",
                        tint = Color.White
                    )
                }
                Spacer(modifier = Modifier.width(8.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = anime.title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = YoruTextPrimary
                    )
                    Text(
                        text = "EP $currentEpisodeNumber: ${currentEpisode.title}",
                        style = MaterialTheme.typography.bodySmall,
                        color = YoruIndigoPrimary
                    )
                }
            }
        }

        // Stream Video Player Container
        item {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(16f / 9f)
                    .background(Color.Black)
                    .testTag("video_player_box")
            ) {
                AsyncImage(
                    model = currentEpisode.thumbnailUrl.ifEmpty { anime.backdrop.ifEmpty { anime.poster } },
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )

                // Dark player overlay
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.4f))
                )

                // Center Play/Pause button
                IconButton(
                    onClick = { isPlaying = !isPlaying },
                    modifier = Modifier
                        .size(56.dp)
                        .clip(RoundedCornerShape(28.dp))
                        .background(YoruIndigoPrimary.copy(alpha = 0.85f))
                        .align(Alignment.Center)
                        .testTag("player_play_pause_btn")
                ) {
                    Icon(
                        imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                        contentDescription = if (isPlaying) "Pause" else "Play",
                        tint = Color.White,
                        modifier = Modifier.size(32.dp)
                    )
                }

                // Top HD pill
                Box(
                    modifier = Modifier
                        .padding(12.dp)
                        .align(Alignment.TopEnd)
                        .clip(RoundedCornerShape(4.dp))
                        .background(Color.Black.copy(alpha = 0.7f))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = "1080p • 60 FPS",
                        color = YoruTextPrimary,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                // Bottom control bar
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.BottomCenter)
                        .background(Color.Black.copy(alpha = 0.7f))
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "14:20 / ${currentEpisode.duration}",
                        color = Color.White,
                        fontSize = 11.sp
                    )

                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Subtitles,
                            contentDescription = "Subtitles",
                            tint = Color.White,
                            modifier = Modifier.size(18.dp)
                        )
                        Icon(
                            imageVector = Icons.Default.Settings,
                            contentDescription = "Settings",
                            tint = Color.White,
                            modifier = Modifier.size(18.dp)
                        )
                        Icon(
                            imageVector = Icons.Default.Fullscreen,
                            contentDescription = "Fullscreen",
                            tint = Color.White,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }
        }

        // Previous / Next Episode Navigation Buttons
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                OutlinedButton(
                    onClick = {
                        if (currentEpisodeNumber > 1) onSelectEpisode(currentEpisodeNumber - 1)
                    },
                    enabled = currentEpisodeNumber > 1,
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = YoruTextPrimary),
                    modifier = Modifier.testTag("prev_episode_btn")
                ) {
                    Icon(imageVector = Icons.Default.SkipPrevious, contentDescription = null)
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(text = "Prev Ep", fontSize = 12.sp)
                }

                OutlinedButton(
                    onClick = {
                        if (currentEpisodeNumber < episodes.size) onSelectEpisode(currentEpisodeNumber + 1)
                    },
                    enabled = currentEpisodeNumber < episodes.size,
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = YoruTextPrimary),
                    modifier = Modifier.testTag("next_episode_btn")
                ) {
                    Text(text = "Next Ep", fontSize = 12.sp)
                    Spacer(modifier = Modifier.width(4.dp))
                    Icon(imageVector = Icons.Default.SkipNext, contentDescription = null)
                }
            }
        }

        // Server Selector
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp)
            ) {
                Text(
                    text = "Streaming Servers",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = YoruTextPrimary
                )
                Spacer(modifier = Modifier.height(8.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(servers) { server ->
                        val isSelected = selectedServer == server
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (isSelected) YoruIndigoPrimary else YoruSurfaceElevated)
                                .clickable { selectedServer = server }
                                .padding(horizontal = 12.dp, vertical = 8.dp)
                                .testTag("server_btn_$server")
                        ) {
                            Text(
                                text = server,
                                color = if (isSelected) Color.White else YoruTextPrimary,
                                fontSize = 12.sp,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                            )
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(14.dp))
        }

        // Episodes Quick Switcher
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp)
            ) {
                Text(
                    text = "Episodes (${episodes.size})",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = YoruTextPrimary
                )
                Spacer(modifier = Modifier.height(8.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(episodes) { ep ->
                        val isCurrent = ep.episodeNumber == currentEpisodeNumber
                        Box(
                            modifier = Modifier
                                .size(44.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (isCurrent) YoruIndigoPrimary else YoruSurfaceElevated)
                                .clickable { onSelectEpisode(ep.episodeNumber) }
                                .testTag("quick_ep_${ep.episodeNumber}"),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "${ep.episodeNumber}",
                                color = if (isCurrent) Color.White else YoruTextPrimary,
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp
                            )
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(20.dp))
        }

        // Comments Section
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
            ) {
                Text(
                    text = "Episode Discussion (${comments.size})",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = YoruTextPrimary
                )
                Spacer(modifier = Modifier.height(10.dp))

                // New comment input
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = commentText,
                        onValueChange = { commentText = it },
                        placeholder = { Text("Leave a comment...", color = YoruTextMuted, fontSize = 13.sp) },
                        modifier = Modifier
                            .weight(1f)
                            .testTag("comment_input"),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = YoruSurfaceElevated,
                            unfocusedContainerColor = YoruSurfaceElevated,
                            focusedBorderColor = YoruIndigoPrimary,
                            unfocusedBorderColor = YoruCardBorder,
                            focusedTextColor = YoruTextPrimary,
                            unfocusedTextColor = YoruTextPrimary
                        ),
                        shape = RoundedCornerShape(10.dp),
                        singleLine = true
                    )

                    Button(
                        onClick = {
                            if (commentText.isNotBlank()) {
                                comments.add(0, CommunityComment("c_${System.currentTimeMillis()}", "watch", "You", "", commentText.trim()))
                                commentText = ""
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = YoruIndigoPrimary),
                        shape = RoundedCornerShape(10.dp),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                        modifier = Modifier.testTag("comment_submit_btn")
                    ) {
                        Text("Post", fontWeight = FontWeight.Bold)
                    }
                }
            }
            Spacer(modifier = Modifier.height(14.dp))
        }

        // Comments list
        items(comments) { comment ->
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                colors = CardDefaults.cardColors(containerColor = YoruSurfaceElevated),
                shape = RoundedCornerShape(8.dp)
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = comment.authorName,
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp,
                            color = YoruIndigoPrimary
                        )
                        Text(
                            text = comment.timestamp,
                            fontSize = 11.sp,
                            color = YoruTextMuted
                        )
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = comment.content,
                        fontSize = 13.sp,
                        color = YoruTextPrimary
                    )
                }
            }
        }
    }
}
