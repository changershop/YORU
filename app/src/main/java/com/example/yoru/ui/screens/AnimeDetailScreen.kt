package com.example.yoru.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.example.yoru.data.model.Anime
import com.example.yoru.data.model.Episode
import com.example.yoru.ui.theme.*

@Composable
fun AnimeDetailScreen(
    anime: Anime,
    episodes: List<Episode>,
    isInWatchlist: Boolean,
    onBackClick: () -> Unit,
    onWatchEpisodeClick: (Int) -> Unit,
    onToggleWatchlist: () -> Unit
) {
    var isSynopsisExpanded by remember { mutableStateOf(false) }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(YoruBackground)
            .testTag("anime_detail_screen"),
        contentPadding = PaddingValues(bottom = 80.dp)
    ) {
        // Hero Backdrop with Back & Watchlist Button
        item {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(280.dp)
            ) {
                AsyncImage(
                    model = anime.backdrop.ifEmpty { anime.poster },
                    contentDescription = anime.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )

                // Dark cinematic gradient
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(
                                    Color.Black.copy(alpha = 0.5f),
                                    Color.Transparent,
                                    YoruBackground.copy(alpha = 0.8f),
                                    YoruBackground
                                )
                            )
                        )
                )

                // Top actions
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(
                        onClick = onBackClick,
                        modifier = Modifier
                            .size(40.dp)
                            .clip(RoundedCornerShape(20.dp))
                            .background(YoruSurface.copy(alpha = 0.75f))
                            .testTag("detail_back_btn")
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = Color.White
                        )
                    }

                    IconButton(
                        onClick = onToggleWatchlist,
                        modifier = Modifier
                            .size(40.dp)
                            .clip(RoundedCornerShape(20.dp))
                            .background(YoruSurface.copy(alpha = 0.75f))
                            .testTag("detail_watchlist_toggle")
                    ) {
                        Icon(
                            imageVector = if (isInWatchlist) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder,
                            contentDescription = "Watchlist",
                            tint = if (isInWatchlist) YoruIndigoPrimary else Color.White
                        )
                    }
                }
            }
        }

        // Info Header (Poster + Meta)
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .offset(y = (-40).dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.Bottom
            ) {
                // Poster
                Box(
                    modifier = Modifier
                        .width(110.dp)
                        .height(160.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(YoruSurfaceElevated)
                ) {
                    AsyncImage(
                        model = anime.poster,
                        contentDescription = anime.title,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )
                }

                // Title and badges
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        text = anime.title,
                        style = MaterialTheme.typography.titleLarge.copy(
                            fontWeight = FontWeight.ExtraBold,
                            letterSpacing = (-0.3).sp
                        ),
                        color = YoruTextPrimary
                    )

                    if (anime.nativeTitle.isNotEmpty()) {
                        Text(
                            text = anime.nativeTitle,
                            style = MaterialTheme.typography.bodySmall,
                            color = YoruTextMuted
                        )
                    }

                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Score
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(YoruScoreGold.copy(alpha = 0.15f))
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(3.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Star,
                                    contentDescription = null,
                                    tint = YoruScoreGold,
                                    modifier = Modifier.size(12.dp)
                                )
                                Text(
                                    text = anime.averageScore,
                                    color = YoruScoreGold,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }

                        // Format
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(YoruSurfaceElevated)
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        ) {
                            Text(
                                text = anime.format,
                                color = YoruTextPrimary,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }

                        // Status
                        Text(
                            text = anime.status,
                            color = if (anime.status.equals("Releasing", ignoreCase = true)) YoruSuccessGreen else YoruTextMuted,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }
        }

        // Action Buttons Row
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .offset(y = (-20).dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Button(
                    onClick = { onWatchEpisodeClick(1) },
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                        .testTag("detail_play_btn"),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = YoruIndigoPrimary,
                        contentColor = Color.White
                    ),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(imageVector = Icons.Default.PlayArrow, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(text = "Watch Episode 1", fontWeight = FontWeight.Bold)
                }

                OutlinedButton(
                    onClick = onToggleWatchlist,
                    modifier = Modifier
                        .height(48.dp)
                        .testTag("detail_watchlist_btn"),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = if (isInWatchlist) YoruIndigoPrimary else YoruTextPrimary
                    )
                ) {
                    Icon(
                        imageVector = if (isInWatchlist) Icons.Filled.Bookmark else Icons.Filled.BookmarkAdd,
                        contentDescription = null,
                        tint = if (isInWatchlist) YoruIndigoPrimary else YoruTextPrimary
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = if (isInWatchlist) "Saved" else "Watchlist",
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }

        // Genres list
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                anime.genres.forEach { genre ->
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(16.dp))
                            .background(YoruSurfaceElevated)
                            .padding(horizontal = 10.dp, vertical = 4.dp)
                    ) {
                        Text(text = genre, color = YoruTextMuted, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                    }
                }
            }
            Spacer(modifier = Modifier.height(14.dp))
        }

        // Synopsis
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
            ) {
                Text(
                    text = "Synopsis",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = YoruTextPrimary
                )
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = anime.synopsis,
                    style = MaterialTheme.typography.bodyMedium,
                    color = YoruTextMuted,
                    maxLines = if (isSynopsisExpanded) Int.MAX_VALUE else 3,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = if (isSynopsisExpanded) "Show less" else "Read more",
                    color = YoruIndigoPrimary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .clickable { isSynopsisExpanded = !isSynopsisExpanded }
                        .padding(vertical = 4.dp)
                )
            }
            Spacer(modifier = Modifier.height(16.dp))
        }

        // Metadata grid (Studio, Season, Duration, Total Episodes)
        item {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                colors = CardDefaults.cardColors(containerColor = YoruSurfaceElevated),
                shape = RoundedCornerShape(12.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    horizontalArrangement = Arrangement.SpaceAround
                ) {
                    MetaItem(label = "Studio", value = anime.studios)
                    MetaItem(label = "Season", value = anime.season)
                    MetaItem(label = "Episodes", value = "${anime.totalEpisodes}")
                    MetaItem(label = "Duration", value = anime.episodeDuration)
                }
            }
            Spacer(modifier = Modifier.height(24.dp))
        }

        // Episodes Header
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Episodes (${episodes.size})",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = YoruTextPrimary
                )
                Text(
                    text = "Sub / Dub Available",
                    fontSize = 12.sp,
                    color = YoruIndigoPrimary,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }

        // Episodes List
        items(episodes) { ep ->
            EpisodeItemRow(
                episode = ep,
                onClick = { onWatchEpisodeClick(ep.episodeNumber) }
            )
        }
    }
}

@Composable
fun MetaItem(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = label, fontSize = 11.sp, color = YoruTextMuted)
        Spacer(modifier = Modifier.height(2.dp))
        Text(text = value, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = YoruTextPrimary)
    }
}

@Composable
fun EpisodeItemRow(
    episode: Episode,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(YoruSurfaceElevated)
            .clickable { onClick() }
            .padding(10.dp)
            .testTag("episode_item_${episode.episodeNumber}"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(
            modifier = Modifier
                .width(80.dp)
                .height(50.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(YoruBackground)
        ) {
            AsyncImage(
                model = episode.thumbnailUrl,
                contentDescription = episode.title,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
            Box(
                modifier = Modifier
                    .size(22.dp)
                    .clip(RoundedCornerShape(11.dp))
                    .background(Color.Black.copy(alpha = 0.6f))
                    .align(Alignment.Center),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.PlayArrow,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(14.dp)
                )
            }
        }

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "EP ${episode.episodeNumber}: ${episode.title}",
                style = MaterialTheme.typography.titleSmall,
                color = YoruTextPrimary,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = episode.duration,
                style = MaterialTheme.typography.bodySmall,
                color = YoruTextMuted
            )
        }

        Icon(
            imageVector = Icons.Default.PlayCircle,
            contentDescription = "Play",
            tint = YoruIndigoPrimary,
            modifier = Modifier.size(24.dp)
        )
    }
}
