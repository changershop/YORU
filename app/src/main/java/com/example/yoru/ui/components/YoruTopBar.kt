package com.example.yoru.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.yoru.ui.theme.*

@Composable
fun YoruTopBar(
    onSearchClick: () -> Unit = {},
    onWatchlistClick: () -> Unit = {}
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(YoruBackground)
            .statusBarsPadding()
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .testTag("top_bar"),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(YoruIndigoPrimary),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "夜",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp
                )
            }

            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "REMIX ",
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontWeight = FontWeight.ExtraBold,
                            color = YoruTextPrimary
                        )
                    )
                    Text(
                        text = "YORU",
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontWeight = FontWeight.Black,
                            color = YoruIndigoPrimary
                        )
                    )
                }
            }
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            IconButton(
                onClick = onSearchClick,
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .background(YoruSurfaceElevated)
                    .testTag("top_search_btn")
            ) {
                Icon(
                    imageVector = Icons.Default.Search,
                    contentDescription = "Search Anime",
                    tint = YoruTextPrimary,
                    modifier = Modifier.size(20.dp)
                )
            }

            IconButton(
                onClick = onWatchlistClick,
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .background(YoruSurfaceElevated)
                    .testTag("top_watchlist_btn")
            ) {
                Icon(
                    imageVector = Icons.Default.Bookmark,
                    contentDescription = "Watchlist",
                    tint = YoruTextPrimary,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}
