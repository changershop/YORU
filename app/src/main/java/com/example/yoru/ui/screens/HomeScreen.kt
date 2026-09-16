package com.example.yoru.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Whatshot
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.example.yoru.data.local.WatchHistoryEntity
import com.example.yoru.data.model.Anime
import com.example.yoru.data.model.SpotlightSlide
import com.example.yoru.ui.components.AnimeCard
import com.example.yoru.ui.components.HeroSpotlightCarousel
import com.example.yoru.ui.theme.*

@Composable
fun HomeScreen(
    spotlights: List<SpotlightSlide>,
    trendingAnime: List<Anime>,
    recentAnime: List<Anime>,
    watchHistory: List<WatchHistoryEntity>,
    onAnimeClick: (String) -> Unit,
    onWatchClick: (String, Int) -> Unit,
    onGenreSelect: (String) -> Unit
) {
    val genres = listOf("All", "Action", "Dark Fantasy", "Sci-Fi", "Mystery", "Cyberpunk", "Adventure", "Magic", "Mecha")

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(YoruBackground)
            .testTag("home_screen"),
        contentPadding = PaddingValues(bottom = 90.dp)
    ) {
        // Hero Spotlight
        item {
            HeroSpotlightCarousel(
                spotlights = spotlights,
                onWatchClick = { slug -> onWatchClick(slug, 1) },
                onDetailClick = onAnimeClick
            )
        }

        // Continue Watching (if history exists)
        if (watchHistory.isNotEmpty()) {
            item {
                SectionHeader(title = "Continue Watching", icon = Icons.Default.PlayArrow)
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    items(watchHistory) { history ->
                        ContinueWatchingCard(
                            history = history,
                            onClick = { onWatchClick(history.slug, history.episodeNumber) }
                        )
                    }
                }
                Spacer(modifier = Modifier.height(20.dp))
            }
        }

        // Genre Filter Chips
        item {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(vertical = 12.dp)
            ) {
                items(genres) { genre ->
                    SuggestionChip(
                        onClick = { onGenreSelect(genre) },
                        label = { Text(text = genre, fontSize = 12.sp, fontWeight = FontWeight.SemiBold) },
                        colors = SuggestionChipDefaults.suggestionChipColors(
                            containerColor = YoruSurfaceElevated,
                            labelColor = YoruTextPrimary
                        ),
                        border = SuggestionChipDefaults.suggestionChipBorder(
                            enabled = true,
                            borderColor = YoruCardBorder
                        ),
                        shape = RoundedCornerShape(20.dp),
                        modifier = Modifier.testTag("genre_chip_$genre")
                    )
                }
            }
        }

        // Trending Now Section
        item {
            SectionHeader(title = "Trending Now", icon = Icons.Default.Whatshot)
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                items(trendingAnime) { anime ->
                    AnimeCard(
                        anime = anime,
                        onClick = { onAnimeClick(anime.slug) }
                    )
                }
            }
            Spacer(modifier = Modifier.height(24.dp))
        }

        // Recently Added Section
        item {
            SectionHeader(title = "Recently Added", subtitle = "Latest episodes & simulcasts")
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                items(recentAnime) { anime ->
                    AnimeCard(
                        anime = anime,
                        onClick = { onAnimeClick(anime.slug) }
                    )
                }
            }
            Spacer(modifier = Modifier.height(24.dp))
        }

        // Top Airing
        item {
            SectionHeader(title = "Fall 2026 Season", subtitle = "Currently broadcasting")
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                items(trendingAnime.reversed()) { anime ->
                    AnimeCard(
                        anime = anime,
                        onClick = { onAnimeClick(anime.slug) }
                    )
                }
            }
        }
    }
}

@Composable
fun SectionHeader(
    title: String,
    subtitle: String? = null,
    icon: androidx.compose.ui.graphics.vector.ImageVector? = null
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 10.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            if (icon != null) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = YoruIndigoPrimary,
                    modifier = Modifier.size(20.dp)
                )
            }
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge.copy(
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = (-0.3).sp
                ),
                color = YoruTextPrimary
            )
        }
        if (subtitle != null) {
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = YoruTextMuted
            )
        }
    }
}

@Composable
fun ContinueWatchingCard(
    history: WatchHistoryEntity,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .width(260.dp)
            .height(84.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(YoruSurfaceElevated)
            .clickable { onClick() }
            .padding(8.dp)
            .testTag("continue_watching_${history.animeId}"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(
            modifier = Modifier
                .width(60.dp)
                .fillMaxHeight()
                .clip(RoundedCornerShape(8.dp))
                .background(YoruBackground)
        ) {
            AsyncImage(
                model = history.poster,
                contentDescription = history.title,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
            Box(
                modifier = Modifier
                    .size(24.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(YoruIndigoPrimary.copy(alpha = 0.85f))
                    .align(Alignment.Center),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.PlayArrow,
                    contentDescription = "Play",
                    tint = Color.White,
                    modifier = Modifier.size(14.dp)
                )
            }
        }

        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = history.title,
                style = MaterialTheme.typography.titleSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = YoruTextPrimary,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "Episode ${history.episodeNumber}",
                style = MaterialTheme.typography.bodySmall,
                color = YoruIndigoPrimary,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(4.dp))
            // Progress line
            LinearProgressIndicator(
                progress = { 0.45f },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(3.dp)
                    .clip(RoundedCornerShape(2.dp)),
                color = YoruIndigoPrimary,
                trackColor = YoruCardBorder,
            )
        }
    }
}
