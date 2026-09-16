package com.example.yoru.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.navArgument
import com.example.yoru.ui.YoruViewModel
import com.example.yoru.ui.components.YoruBottomNav
import com.example.yoru.ui.components.YoruTopBar
import com.example.yoru.ui.screens.*

@Composable
fun YoruNavGraph(
    navController: NavHostController,
    viewModel: YoruViewModel
) {
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route ?: "home"

    val isTopLevelDestination = currentRoute in listOf("home", "browse", "watchlist", "community", "profile")

    val watchlist by viewModel.watchlist.collectAsState()
    val watchHistory by viewModel.watchHistory.collectAsState()
    val communityPosts by viewModel.communityPosts.collectAsState()
    val commentsMap by viewModel.commentsMap.collectAsState()
    val selectedGenreFilter by viewModel.selectedGenreFilter.collectAsState()

    Scaffold(
        topBar = {
            if (isTopLevelDestination && currentRoute != "browse") {
                YoruTopBar(
                    onSearchClick = { navController.navigate("browse") },
                    onWatchlistClick = { navController.navigate("watchlist") }
                )
            }
        },
        bottomBar = {
            if (isTopLevelDestination) {
                YoruBottomNav(
                    currentRoute = currentRoute,
                    onNavigate = { route ->
                        if (route != currentRoute) {
                            navController.navigate(route) {
                                popUpTo("home") { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    }
                )
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = "home",
            modifier = Modifier.padding(innerPadding)
        ) {
            // Home Destination
            composable("home") {
                HomeScreen(
                    spotlights = viewModel.spotlights,
                    trendingAnime = viewModel.trendingAnime,
                    recentAnime = viewModel.recentAnime,
                    watchHistory = watchHistory,
                    onAnimeClick = { slug -> navController.navigate("detail/$slug") },
                    onWatchClick = { slug, ep ->
                        val anime = viewModel.getAnimeBySlug(slug)
                        if (anime != null) {
                            viewModel.recordWatchProgress(anime, ep)
                        }
                        navController.navigate("watch/$slug/$ep")
                    },
                    onGenreSelect = { genre ->
                        viewModel.setGenreFilter(genre)
                        navController.navigate("browse")
                    }
                )
            }

            // Browse Destination
            composable("browse") {
                BrowseScreen(
                    animeList = viewModel.allAnime,
                    initialGenre = selectedGenreFilter,
                    onAnimeClick = { slug -> navController.navigate("detail/$slug") }
                )
            }

            // Watchlist Destination
            composable("watchlist") {
                WatchlistScreen(
                    watchlist = watchlist,
                    onAnimeClick = { slug -> navController.navigate("detail/$slug") },
                    onRemoveClick = { animeId -> viewModel.removeFromWatchlist(animeId) },
                    onExploreClick = { navController.navigate("browse") }
                )
            }

            // Community Destination
            composable("community") {
                CommunityScreen(
                    posts = communityPosts,
                    commentsMap = commentsMap,
                    onAddPost = { content -> viewModel.addCommunityPost(content) },
                    onLikePost = { postId -> viewModel.likePost(postId) },
                    onAddComment = { postId, text -> viewModel.addComment(postId, text) }
                )
            }

            // Profile Destination
            composable("profile") {
                ProfileScreen(
                    watchHistory = watchHistory,
                    watchlistCount = watchlist.size,
                    onClearHistory = { viewModel.clearHistory() },
                    onHistoryItemClick = { slug, ep ->
                        navController.navigate("watch/$slug/$ep")
                    }
                )
            }

            // Anime Detail Destination
            composable(
                route = "detail/{slug}",
                arguments = listOf(navArgument("slug") { type = NavType.StringType })
            ) { backStack ->
                val slug = backStack.arguments?.getString("slug") ?: ""
                val anime = viewModel.getAnimeBySlug(slug) ?: viewModel.allAnime.first()
                val episodes = viewModel.getEpisodesForAnime(anime.id)
                val isInWatchlist = watchlist.any { it.animeId == anime.id }

                AnimeDetailScreen(
                    anime = anime,
                    episodes = episodes,
                    isInWatchlist = isInWatchlist,
                    onBackClick = { navController.popBackStack() },
                    onWatchEpisodeClick = { epNum ->
                        viewModel.recordWatchProgress(anime, epNum)
                        navController.navigate("watch/${anime.slug}/$epNum")
                    },
                    onToggleWatchlist = { viewModel.toggleWatchlist(anime) }
                )
            }

            // Watch Stream Destination
            composable(
                route = "watch/{slug}/{ep}",
                arguments = listOf(
                    navArgument("slug") { type = NavType.StringType },
                    navArgument("ep") { type = NavType.IntType }
                )
            ) { backStack ->
                val slug = backStack.arguments?.getString("slug") ?: ""
                val epNum = backStack.arguments?.getInt("ep") ?: 1
                val anime = viewModel.getAnimeBySlug(slug) ?: viewModel.allAnime.first()
                val episodes = viewModel.getEpisodesForAnime(anime.id)

                WatchScreen(
                    anime = anime,
                    episodes = episodes,
                    currentEpisodeNumber = epNum,
                    onBackClick = { navController.popBackStack() },
                    onSelectEpisode = { nextEp ->
                        viewModel.recordWatchProgress(anime, nextEp)
                        navController.navigate("watch/${anime.slug}/$nextEp") {
                            popUpTo("detail/${anime.slug}")
                        }
                    }
                )
            }
        }
    }
}
