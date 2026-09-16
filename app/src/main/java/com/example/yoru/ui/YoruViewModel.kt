package com.example.yoru.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.yoru.data.local.WatchHistoryEntity
import com.example.yoru.data.local.WatchlistEntity
import com.example.yoru.data.model.Anime
import com.example.yoru.data.model.CommunityComment
import com.example.yoru.data.model.CommunityPost
import com.example.yoru.data.model.Episode
import com.example.yoru.data.model.SpotlightSlide
import com.example.yoru.data.repository.AnimeRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

class YoruViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = AnimeRepository(application)

    val allAnime: List<Anime> = repository.getAllAnime()
    val spotlights: List<SpotlightSlide> = repository.getSpotlights()
    val trendingAnime: List<Anime> = repository.getTrendingAnime()
    val recentAnime: List<Anime> = repository.getRecentlyAddedAnime()

    val watchlist: StateFlow<List<WatchlistEntity>> = repository.getWatchlist()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val watchHistory: StateFlow<List<WatchHistoryEntity>> = repository.getWatchHistory()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val communityPosts: StateFlow<List<CommunityPost>> = repository.communityPosts
    val commentsMap: StateFlow<Map<String, List<CommunityComment>>> = repository.postComments

    private val _selectedGenreFilter = MutableStateFlow<String?>(null)
    val selectedGenreFilter = _selectedGenreFilter.asStateFlow()

    fun setGenreFilter(genre: String) {
        _selectedGenreFilter.value = if (genre == "All") null else genre
    }

    fun getAnimeBySlug(slug: String): Anime? {
        return repository.getAnimeBySlug(slug)
    }

    fun getEpisodesForAnime(animeId: String): List<Episode> {
        return repository.getEpisodesForAnime(animeId)
    }

    fun toggleWatchlist(anime: Anime) {
        viewModelScope.launch {
            repository.toggleWatchlist(anime)
        }
    }

    fun removeFromWatchlist(animeId: String) {
        val anime = allAnime.find { it.id == animeId }
        if (anime != null) {
            viewModelScope.launch {
                repository.toggleWatchlist(anime)
            }
        }
    }

    fun recordWatchProgress(anime: Anime, episodeNum: Int) {
        viewModelScope.launch {
            repository.recordWatchProgress(anime, episodeNum)
        }
    }

    fun clearHistory() {
        viewModelScope.launch {
            repository.clearHistory()
        }
    }

    fun addCommunityPost(content: String, authorName: String = "ShinobiOtaku") {
        repository.addPost(content, authorName)
    }

    fun likePost(postId: String) {
        repository.likePost(postId)
    }

    fun addComment(postId: String, content: String, authorName: String = "ShinobiOtaku") {
        repository.addComment(postId, content, authorName)
    }
}
