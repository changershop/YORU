package com.example.yoru.data.repository

import android.content.Context
import com.example.yoru.data.local.WatchHistoryEntity
import com.example.yoru.data.local.WatchlistEntity
import com.example.yoru.data.local.YoruDatabase
import com.example.yoru.data.model.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

class AnimeRepository(context: Context) {
    private val db = YoruDatabase.getDatabase(context)
    private val watchlistDao = db.watchlistDao()
    private val watchHistoryDao = db.watchHistoryDao()

    private val _communityPosts = MutableStateFlow(sampleCommunityPosts)
    val communityPosts = _communityPosts.asStateFlow()

    private val _postComments = MutableStateFlow<Map<String, List<CommunityComment>>>(
        mapOf(
            "p1" to listOf(
                CommunityComment("c1", "p1", "Yuki", "", "Animation in Episode 12 was cinema!"),
                CommunityComment("c2", "p1", "Kenji", "", "Agreed, best fight sequence of the season.")
            )
        )
    )
    val postComments = _postComments.asStateFlow()

    fun getAllAnime(): List<Anime> = animeCatalog

    fun getSpotlights(): List<SpotlightSlide> = spotlightList

    fun getTrendingAnime(): List<Anime> = animeCatalog.sortedByDescending { it.averageScore.replace("%", "").toIntOrNull() ?: 0 }

    fun getRecentlyAddedAnime(): List<Anime> = animeCatalog.take(6)

    fun getAnimeBySlug(slug: String): Anime? {
        return animeCatalog.find { it.slug.equals(slug, ignoreCase = true) || it.id.equals(slug, ignoreCase = true) }
    }

    fun getEpisodesForAnime(animeId: String): List<Episode> {
        val anime = animeCatalog.find { it.id == animeId } ?: return emptyList()
        return (1..anime.totalEpisodes).map { epNum ->
            Episode(
                id = "ep_${animeId}_$epNum",
                animeId = animeId,
                episodeNumber = epNum,
                title = "Episode $epNum: The Awakened Power",
                duration = anime.episodeDuration,
                servers = listOf(
                    ServerLink("HD-1 (Sub)", "https://example.com/stream/sub/$animeId/$epNum", "sub"),
                    ServerLink("HD-2 (Dub)", "https://example.com/stream/dub/$animeId/$epNum", "dub"),
                    ServerLink("Server Multi", "https://example.com/stream/multi/$animeId/$epNum", "multi")
                ),
                thumbnailUrl = anime.backdrop.ifEmpty { anime.poster }
            )
        }
    }

    fun searchAnime(query: String, selectedGenre: String?, selectedFormat: String?): List<Anime> {
        return animeCatalog.filter { anime ->
            val matchesQuery = query.isBlank() ||
                anime.title.contains(query, ignoreCase = true) ||
                anime.nativeTitle.contains(query, ignoreCase = true) ||
                anime.studios.contains(query, ignoreCase = true)
            val matchesGenre = selectedGenre.isNullOrBlank() || selectedGenre == "All" || anime.genres.contains(selectedGenre)
            val matchesFormat = selectedFormat.isNullOrBlank() || selectedFormat == "All" || anime.format.equals(selectedFormat, ignoreCase = true)
            matchesQuery && matchesGenre && matchesFormat
        }
    }

    // Watchlist
    fun getWatchlist(): Flow<List<WatchlistEntity>> = watchlistDao.getAllWatchlist()

    suspend fun isAnimeInWatchlist(animeId: String): Boolean {
        return watchlistDao.getWatchlistById(animeId) != null
    }

    suspend fun toggleWatchlist(anime: Anime, status: String = "Watching"): Boolean {
        val existing = watchlistDao.getWatchlistById(anime.id)
        return if (existing != null) {
            watchlistDao.delete(anime.id)
            false
        } else {
            watchlistDao.insertOrUpdate(
                WatchlistEntity(
                    animeId = anime.id,
                    title = anime.title,
                    slug = anime.slug,
                    poster = anime.poster,
                    format = anime.format,
                    score = anime.averageScore,
                    status = status
                )
            )
            true
        }
    }

    // Watch History
    fun getWatchHistory(): Flow<List<WatchHistoryEntity>> = watchHistoryDao.getRecentHistory()

    suspend fun recordWatchProgress(anime: Anime, episodeNum: Int, progressSec: Long = 600) {
        watchHistoryDao.saveProgress(
            WatchHistoryEntity(
                animeId = anime.id,
                title = anime.title,
                slug = anime.slug,
                poster = anime.poster,
                episodeNumber = episodeNum,
                progressSeconds = progressSec,
                updatedAt = System.currentTimeMillis()
            )
        )
    }

    suspend fun clearHistory() {
        watchHistoryDao.clearAll()
    }

    // Community
    fun addPost(content: String, authorName: String) {
        val newPost = CommunityPost(
            id = "p_${System.currentTimeMillis()}",
            authorName = authorName,
            authorAvatar = "",
            content = content,
            hashtags = listOf("YORUCommunity", "AnimeTalk"),
            commentCount = 0,
            likesCount = 1,
            timestamp = "Just now"
        )
        _communityPosts.value = listOf(newPost) + _communityPosts.value
    }

    fun likePost(postId: String) {
        _communityPosts.value = _communityPosts.value.map { post ->
            if (post.id == postId) post.copy(likesCount = post.likesCount + 1) else post
        }
    }

    fun addComment(postId: String, content: String, authorName: String) {
        val currentComments = _postComments.value[postId] ?: emptyList()
        val newComment = CommunityComment(
            id = "c_${System.currentTimeMillis()}",
            postId = postId,
            authorName = authorName,
            content = content,
            timestamp = "Just now"
        )
        _postComments.value = _postComments.value + (postId to (currentComments + newComment))
        _communityPosts.value = _communityPosts.value.map { post ->
            if (post.id == postId) post.copy(commentCount = post.commentCount + 1) else post
        }
    }

    companion object {
        val sampleCommunityPosts = listOf(
            CommunityPost(
                id = "p1",
                authorName = "ShadowMaster",
                authorRole = "moderator",
                content = "Episode 12 of Shadows of the Eclipse just dropped! That final clash was pure cinema. What did everyone think of the moon blade technique?",
                hashtags = listOf("ShadowsOfTheEclipse", "EpisodeDiscussion"),
                commentCount = 18,
                likesCount = 42,
                isPinned = true,
                timestamp = "2 hours ago"
            ),
            CommunityPost(
                id = "p2",
                authorName = "CyberNinja",
                authorRole = "user",
                content = "Neon Echoes soundtrack is now on repeat for my study sessions. The lo-fi cyberpunk synth atmosphere is unmatched.",
                hashtags = listOf("NeonEchoes", "OST"),
                commentCount = 9,
                likesCount = 27,
                timestamp = "5 hours ago"
            ),
            CommunityPost(
                id = "p3",
                authorName = "KitsuneAnime",
                authorRole = "user",
                content = "Fall 2026 anime season is turning out to be one of the best in years. What are your top 3 shows so far?",
                hashtags = listOf("Fall2026", "TopAnime"),
                commentCount = 31,
                likesCount = 56,
                timestamp = "Yesterday"
            )
        )

        val spotlightList = listOf(
            SpotlightSlide(
                id = "sp1",
                order = 1,
                animeId = "a1",
                animeSlug = "shadows-of-the-eclipse",
                title = "Shadows of the Eclipse",
                badge = "#1 Spotlight",
                backdrop = "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&q=80&w=1920",
                synopsis = "In a world where the sun never truly rises, a young twilight warrior discovers the ancient dark arts to combat eternal night creatures.",
                format = "TV",
                year = "2026",
                duration = "24m"
            ),
            SpotlightSlide(
                id = "sp2",
                order = 2,
                animeId = "a2",
                animeSlug = "neon-echoes",
                title = "Neon Echoes",
                badge = "#2 Trending",
                backdrop = "https://images.unsplash.com/photo-1605806616949-1e87b487cb2a?auto=format&fit=crop&q=80&w=1920",
                synopsis = "A cyberpunk mystery thriller set in high-tech Neo-Dhaka, where digital memories are traded like cryptocurrency and secrets kill.",
                format = "TV",
                year = "2025",
                duration = "23m"
            ),
            SpotlightSlide(
                id = "sp3",
                order = 3,
                animeId = "a3",
                animeSlug = "abyssal-blade",
                title = "Abyssal Blade: Requiem",
                badge = "#3 New Season",
                backdrop = "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&q=80&w=1920",
                synopsis = "Bound by blood and destiny, the remaining samurai of the Abyssal Clan wage war against celestial deities threatening their realm.",
                format = "Movie",
                year = "2026",
                duration = "108m"
            )
        )

        val animeCatalog = listOf(
            Anime(
                id = "a1",
                title = "Shadows of the Eclipse",
                nativeTitle = "エクリプスの影",
                slug = "shadows-of-the-eclipse",
                synopsis = "In a world where the sun never truly rises, a young twilight warrior discovers the forbidden power of midnight to combat mythical creatures threatening humanity's last stronghold.",
                poster = "https://images.unsplash.com/photo-1542451313056-b7c8e626645f?auto=format&fit=crop&q=80&w=600",
                backdrop = "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&q=80&w=1920",
                genres = listOf("Action", "Dark Fantasy", "Supernatural"),
                format = "TV",
                status = "Releasing",
                season = "Fall 2026",
                averageScore = "92%",
                studios = "MAPPA",
                episodeDuration = "24 mins",
                totalEpisodes = 24
            ),
            Anime(
                id = "a2",
                title = "Neon Echoes",
                nativeTitle = "ネオン・エコーズ",
                slug = "neon-echoes",
                synopsis = "A cyberpunk detective story set in Neo-Dhaka, where digitized consciousness and synthetic souls are traded like currency. One detective is determined to find who is erasing the city's timeline.",
                poster = "https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&q=80&w=600",
                backdrop = "https://images.unsplash.com/photo-1605806616949-1e87b487cb2a?auto=format&fit=crop&q=80&w=1920",
                genres = listOf("Sci-Fi", "Mystery", "Cyberpunk"),
                format = "TV",
                status = "Finished",
                season = "Winter 2025",
                averageScore = "87%",
                studios = "Bones",
                episodeDuration = "23 mins",
                totalEpisodes = 12
            ),
            Anime(
                id = "a3",
                title = "Abyssal Blade: Requiem",
                nativeTitle = "深淵の刃 レクイエム",
                slug = "abyssal-blade",
                synopsis = "The legendary blade that was forged in the abyss must be restored before the demonic eclipse completes. The last remaining master swordsman embarks on a perilous ascension.",
                poster = "https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&q=80&w=600",
                backdrop = "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&q=80&w=1920",
                genres = listOf("Action", "Fantasy", "Martial Arts"),
                format = "Movie",
                status = "Finished",
                season = "Summer 2026",
                averageScore = "94%",
                studios = "Ufotable",
                episodeDuration = "108 mins",
                totalEpisodes = 1
            ),
            Anime(
                id = "a4",
                title = "Chronicles of Valerius",
                nativeTitle = "ヴァレリアス年代記",
                slug = "chronicles-of-valerius",
                synopsis = "Imperial magic knights battle against corrupt royal houses using celestial artifacts in a rich high-fantasy realm of sky fortresses and elemental dragons.",
                poster = "https://images.unsplash.com/photo-1514539079130-25950c84af65?auto=format&fit=crop&q=80&w=600",
                backdrop = "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&q=80&w=1920",
                genres = listOf("Fantasy", "Adventure", "Magic"),
                format = "TV",
                status = "Releasing",
                season = "Fall 2026",
                averageScore = "89%",
                studios = "Wit Studio",
                episodeDuration = "24 mins",
                totalEpisodes = 16
            ),
            Anime(
                id = "a5",
                title = "Silent Horizon",
                nativeTitle = "サイレント・ホライゾン",
                slug = "silent-horizon",
                synopsis = "A quiet, emotional journey across post-apocalyptic coastal cities aboard an antique steam locomotive, exploring memories of forgotten civilizations.",
                poster = "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&q=80&w=600",
                backdrop = "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=1920",
                genres = listOf("Drama", "Sci-Fi", "Slice of Life"),
                format = "TV",
                status = "Finished",
                season = "Spring 2025",
                averageScore = "86%",
                studios = "Kyoto Animation",
                episodeDuration = "22 mins",
                totalEpisodes = 13
            ),
            Anime(
                id = "a6",
                title = "Crimson Vanguard",
                nativeTitle = "深紅のヴァンガード",
                slug = "crimson-vanguard",
                synopsis = "Elite mecha pilots defend the Martian orbital ring against bio-mechanical cosmic horrors in relentless high-speed tactical battles.",
                poster = "https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&q=80&w=600",
                backdrop = "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=1920",
                genres = listOf("Action", "Mecha", "Sci-Fi"),
                format = "TV",
                status = "Releasing",
                season = "Fall 2026",
                averageScore = "90%",
                studios = "Trigger",
                episodeDuration = "24 mins",
                totalEpisodes = 24
            )
        )
    }
}
