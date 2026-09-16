package com.example.yoru.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.yoru.data.model.Anime
import com.example.yoru.ui.components.AnimeCard
import com.example.yoru.ui.theme.*

@Composable
fun BrowseScreen(
    animeList: List<Anime>,
    initialGenre: String? = null,
    onAnimeClick: (String) -> Unit
) {
    var searchQuery by remember { mutableStateOf("") }
    var selectedGenre by remember { mutableStateOf(initialGenre ?: "All") }
    var selectedFormat by remember { mutableStateOf("All") }

    val genres = listOf("All", "Action", "Dark Fantasy", "Sci-Fi", "Mystery", "Cyberpunk", "Adventure", "Magic", "Mecha")
    val formats = listOf("All", "TV", "Movie", "OVA")

    val filteredList = remember(searchQuery, selectedGenre, selectedFormat, animeList) {
        animeList.filter { anime ->
            val matchesQuery = searchQuery.isBlank() ||
                anime.title.contains(searchQuery, ignoreCase = true) ||
                anime.nativeTitle.contains(searchQuery, ignoreCase = true) ||
                anime.studios.contains(searchQuery, ignoreCase = true)
            val matchesGenre = selectedGenre == "All" || anime.genres.contains(selectedGenre)
            val matchesFormat = selectedFormat == "All" || anime.format.equals(selectedFormat, ignoreCase = true)
            matchesQuery && matchesGenre && matchesFormat
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(YoruBackground)
            .statusBarsPadding()
            .testTag("browse_screen")
    ) {
        // Search Input Bar
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            placeholder = { Text("Search anime by title, studio, keyword...", color = YoruTextMuted, fontSize = 14.sp) },
            leadingIcon = {
                Icon(imageVector = Icons.Default.Search, contentDescription = null, tint = YoruTextMuted)
            },
            trailingIcon = {
                if (searchQuery.isNotEmpty()) {
                    IconButton(onClick = { searchQuery = "" }) {
                        Icon(imageVector = Icons.Default.Clear, contentDescription = "Clear", tint = YoruTextMuted)
                    }
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .testTag("browse_search_input"),
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = YoruSurfaceElevated,
                unfocusedContainerColor = YoruSurfaceElevated,
                focusedBorderColor = YoruIndigoPrimary,
                unfocusedBorderColor = YoruCardBorder,
                focusedTextColor = YoruTextPrimary,
                unfocusedTextColor = YoruTextPrimary
            ),
            singleLine = true
        )

        // Genre Filter Chips Row
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(genres) { genre ->
                val isSelected = selectedGenre == genre
                FilterChip(
                    selected = isSelected,
                    onClick = { selectedGenre = genre },
                    label = { Text(text = genre, fontSize = 12.sp, fontWeight = FontWeight.SemiBold) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = YoruIndigoPrimary,
                        selectedLabelColor = YoruTextPrimary,
                        containerColor = YoruSurfaceElevated,
                        labelColor = YoruTextMuted
                    ),
                    border = FilterChipDefaults.filterChipBorder(
                        enabled = true,
                        selected = isSelected,
                        borderColor = if (isSelected) YoruIndigoPrimary else YoruCardBorder
                    ),
                    shape = RoundedCornerShape(20.dp),
                    modifier = Modifier.testTag("browse_genre_$genre")
                )
            }
        }

        // Format Filter Chips Row
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(formats) { format ->
                val isSelected = selectedFormat == format
                FilterChip(
                    selected = isSelected,
                    onClick = { selectedFormat = format },
                    label = { Text(text = format, fontSize = 11.sp) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = YoruSurfaceElevated,
                        selectedLabelColor = YoruIndigoPrimary,
                        containerColor = YoruBackground,
                        labelColor = YoruTextMuted
                    ),
                    border = FilterChipDefaults.filterChipBorder(
                        enabled = true,
                        selected = isSelected,
                        borderColor = if (isSelected) YoruIndigoPrimary else YoruCardBorder
                    ),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.testTag("browse_format_$format")
                )
            }
        }

        // Result Count Row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "${filteredList.size} Anime Found",
                style = MaterialTheme.typography.titleSmall,
                color = YoruTextMuted,
                fontWeight = FontWeight.Medium
            )
        }

        // Grid of results
        if (filteredList.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(32.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "No Anime Found",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = YoruTextPrimary
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "Try adjusting your filters or search keywords.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = YoruTextMuted
                    )
                }
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                modifier = Modifier
                    .fillMaxSize()
                    .testTag("browse_anime_grid"),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 90.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                items(filteredList) { anime ->
                    AnimeCard(
                        anime = anime,
                        onClick = { onAnimeClick(anime.slug) },
                        cardWidth = 170.dp,
                        posterHeight = 230.dp
                    )
                }
            }
        }
    }
}
