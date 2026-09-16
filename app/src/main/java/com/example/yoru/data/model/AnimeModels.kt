package com.example.yoru.data.model

data class Season(
    val id: String,
    val name: String,
    val order: Int
)

data class ServerLink(
    val serverName: String,
    val embedLink: String,
    val serverType: String = "sub" // sub, dub, multi
)

data class Episode(
    val id: String,
    val animeId: String,
    val seasonId: String = "s1",
    val episodeNumber: Int,
    val title: String,
    val duration: String = "24 mins",
    val isFiller: Boolean = false,
    val servers: List<ServerLink> = emptyList(),
    val thumbnailUrl: String = ""
)

data class Anime(
    val id: String,
    val title: String,
    val nativeTitle: String = "",
    val slug: String,
    val format: String = "TV", // TV, Movie, OVA, Special
    val totalEpisodes: Int = 12,
    val episodeDuration: String = "24 mins",
    val status: String = "Releasing", // Releasing, Finished, Upcoming
    val season: String = "Fall 2026",
    val averageScore: String = "91%",
    val studios: String = "MAPPA",
    val genres: List<String> = emptyList(),
    val poster: String = "",
    val backdrop: String = "",
    val synopsis: String = "",
    val seasons: List<Season> = listOf(Season("s1", "Season 1", 1)),
    val subEpisodesCount: Int = 12,
    val dubEpisodesCount: Int = 12
)

data class SpotlightSlide(
    val id: String,
    val order: Int,
    val animeId: String,
    val animeSlug: String,
    val title: String,
    val badge: String = "#1 Spotlight",
    val backdrop: String,
    val synopsis: String,
    val format: String = "TV",
    val year: String = "2026",
    val duration: String = "24m"
)

data class WatchProgressItem(
    val animeId: String,
    val animeTitle: String,
    val animeSlug: String,
    val poster: String,
    val episodeNumber: Int,
    val progressSeconds: Long = 0,
    val totalSeconds: Long = 1440,
    val updatedAt: Long = System.currentTimeMillis()
)

data class CommunityPost(
    val id: String,
    val authorName: String,
    val authorRole: String = "user",
    val authorAvatar: String = "",
    val content: String,
    val mediaUrl: String? = null,
    val hashtags: List<String> = emptyList(),
    val isPinned: Boolean = false,
    val commentCount: Int = 0,
    val likesCount: Int = 0,
    val timestamp: String = "Just now"
)

data class CommunityComment(
    val id: String,
    val postId: String,
    val authorName: String,
    val authorAvatar: String = "",
    val content: String,
    val timestamp: String = "Just now"
)

data class UserBadge(
    val id: String,
    val title: String,
    val description: String,
    val icon: String,
    val color: String = "#4F46E5"
)
