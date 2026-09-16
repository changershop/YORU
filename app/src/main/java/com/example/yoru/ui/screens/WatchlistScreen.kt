package com.example.yoru.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BookmarkRemove
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Star
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
import com.example.yoru.data.local.WatchlistEntity
import com.example.yoru.ui.theme.*

@Composable
fun WatchlistScreen(
    watchlist: List<WatchlistEntity>,
    onAnimeClick: (String) -> Unit,
    onRemoveClick: (String) -> Unit,
    onExploreClick: () -> Unit
) {
    var selectedStatus by remember { mutableStateOf("All") }
    val statuses = listOf("All", "Watching", "Plan to Watch", "Completed")

    val filteredList = remember(watchlist, selectedStatus) {
        if (selectedStatus == "All") watchlist else watchlist.filter { it.status.equals(selectedStatus, ignoreCase = true) }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(YoruBackground)
            .statusBarsPadding()
            .testTag("watchlist_screen")
    ) {
        // Title Header
        Text(
            text = "My Watchlist",
            style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.ExtraBold),
            color = YoruTextPrimary,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)
        )

        // Status Tabs
        TabRow(
            selectedTabIndex = statuses.indexOf(selectedStatus),
            containerColor = YoruSurface,
            contentColor = YoruIndigoPrimary,
            modifier = Modifier.fillMaxWidth()
        ) {
            statuses.forEachIndexed { index, status ->
                Tab(
                    selected = selectedStatus == status,
                    onClick = { selectedStatus = status },
                    text = {
                        Text(
                            text = status,
                            fontWeight = if (selectedStatus == status) FontWeight.Bold else FontWeight.Medium,
                            fontSize = 13.sp,
                            color = if (selectedStatus == status) YoruIndigoPrimary else YoruTextMuted
                        )
                    },
                    modifier = Modifier.testTag("watchlist_tab_$status")
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        if (filteredList.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(32.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "Your Watchlist is Empty",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = YoruTextPrimary
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Bookmark anime series and movies to track what you want to watch next.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = YoruTextMuted,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(
                        onClick = onExploreClick,
                        colors = ButtonDefaults.buttonColors(containerColor = YoruIndigoPrimary),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.testTag("explore_anime_btn")
                    ) {
                        Text("Explore Anime", fontWeight = FontWeight.Bold)
                    }
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(filteredList) { item ->
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onAnimeClick(item.slug) }
                            .testTag("watchlist_item_${item.animeId}"),
                        colors = CardDefaults.cardColors(containerColor = YoruSurfaceElevated),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .width(70.dp)
                                    .height(95.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(YoruBackground)
                            ) {
                                AsyncImage(
                                    model = item.poster,
                                    contentDescription = item.title,
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier.fillMaxSize()
                                )
                            }

                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = item.title,
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = YoruTextPrimary,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )

                                Spacer(modifier = Modifier.height(4.dp))

                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Text(
                                        text = item.format,
                                        fontSize = 11.sp,
                                        color = YoruIndigoPrimary,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(2.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Star,
                                            contentDescription = null,
                                            tint = YoruScoreGold,
                                            modifier = Modifier.size(12.dp)
                                        )
                                        Text(
                                            text = item.score,
                                            fontSize = 11.sp,
                                            color = YoruScoreGold,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(6.dp))

                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(4.dp))
                                        .background(YoruSurface)
                                        .padding(horizontal = 6.dp, vertical = 2.dp)
                                ) {
                                    Text(
                                        text = item.status,
                                        fontSize = 10.sp,
                                        color = YoruTextMuted,
                                        fontWeight = FontWeight.Medium
                                    )
                                }
                            }

                            IconButton(
                                onClick = { onRemoveClick(item.animeId) },
                                modifier = Modifier.testTag("remove_watchlist_${item.animeId}")
                            ) {
                                Icon(
                                    imageVector = Icons.Default.BookmarkRemove,
                                    contentDescription = "Remove from Watchlist",
                                    tint = YoruTextMuted
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
