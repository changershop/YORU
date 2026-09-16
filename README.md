# Remix YORU - Premium Anime Streaming Platform (Android)

A modern Android anime streaming and community application built with **Kotlin** and **Jetpack Compose**, adhering strictly to Material Design 3 guidelines.

## Features

- **Cinematic Hero Spotlight Carousel**: Dynamic high-resolution hero banners showcasing trending and featured anime with seamless slide transitions and quick actions.
- **Continue Watching & Progress Sync**: Tracks local watch progress across anime episodes with persistent state.
- **Rich Anime Discovery & Categorization**:
  - Horizontal carousels for Trending Now and Recently Added simulcasts.
  - Interactive Genre and Format filter chips.
  - Comprehensive 2-column search and browse grid with instant filtering.
- **Detailed Anime Hub (`AnimeDetailScreen`)**:
  - High-resolution poster and backdrop presentation with dark vignette styling.
  - Multi-season and episode list support with duration and thumbnail previews.
  - One-tap Watchlist bookmarking and direct episode playback navigation.
- **Streaming Player Experience (`WatchScreen`)**:
  - Integrated 16:9 streaming video player interface with responsive controls.
  - Multi-server switching (Sub, Dub, Multi-Stream, Cloud Stream).
  - Previous and Next episode skip controls.
  - Real-time in-stream discussion comment feed.
- **Personal Watchlist (`WatchlistScreen`)**:
  - Filter by status tabs: All, Watching, Plan to Watch, and Completed.
  - Quick-action removal and instant resumption.
- **Community Feed (`CommunityScreen`)**:
  - Community discussions, theories, soundtrack shares, and episode debates.
  - Post creation, like counters, and threaded comments.
- **User Profile & Stats (`ProfileScreen`)**:
  - VIP badges, unlocked achievements ("Night Owl", "Early Bird", "Marathon").
  - Aggregate statistics for episodes watched, watchlist total, and posts created.
  - Full watch history management.

## Tech Stack & Architecture

- **Language**: Kotlin
- **UI Framework**: Jetpack Compose with Material Design 3 (M3)
- **Local Persistence**: Android Room Database (`YoruDatabase`, `WatchlistDao`, `WatchHistoryDao`)
- **Navigation**: Navigation Compose with type-safe arguments
- **Image Loading**: Coil Compose (`AsyncImage`)
- **State Management**: Android Architecture Components (`ViewModel`, `StateFlow`)

