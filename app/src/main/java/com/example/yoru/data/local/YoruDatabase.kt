package com.example.yoru.data.local

import android.content.Context
import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "watchlist")
data class WatchlistEntity(
    @PrimaryKey val animeId: String,
    val title: String,
    val slug: String,
    val poster: String,
    val format: String,
    val score: String,
    val status: String = "Watching", // Watching, Plan to Watch, Completed
    val addedAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "watch_history")
data class WatchHistoryEntity(
    @PrimaryKey val animeId: String,
    val title: String,
    val slug: String,
    val poster: String,
    val episodeNumber: Int,
    val progressSeconds: Long = 0,
    val updatedAt: Long = System.currentTimeMillis()
)

@Dao
interface WatchlistDao {
    @Query("SELECT * FROM watchlist ORDER BY addedAt DESC")
    fun getAllWatchlist(): Flow<List<WatchlistEntity>>

    @Query("SELECT * FROM watchlist WHERE animeId = :animeId LIMIT 1")
    suspend fun getWatchlistById(animeId: String): WatchlistEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrUpdate(item: WatchlistEntity)

    @Query("DELETE FROM watchlist WHERE animeId = :animeId")
    suspend fun delete(animeId: String)
}

@Dao
interface WatchHistoryDao {
    @Query("SELECT * FROM watch_history ORDER BY updatedAt DESC LIMIT 10")
    fun getRecentHistory(): Flow<List<WatchHistoryEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveProgress(item: WatchHistoryEntity)

    @Query("DELETE FROM watch_history WHERE animeId = :animeId")
    suspend fun delete(animeId: String)

    @Query("DELETE FROM watch_history")
    suspend fun clearAll()
}

@Database(entities = [WatchlistEntity::class, WatchHistoryEntity::class], version = 1, exportSchema = false)
abstract class YoruDatabase : RoomDatabase() {
    abstract fun watchlistDao(): WatchlistDao
    abstract fun watchHistoryDao(): WatchHistoryDao

    companion object {
        @Volatile
        private var INSTANCE: YoruDatabase? = null

        fun getDatabase(context: Context): YoruDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    YoruDatabase::class.java,
                    "yoru_database"
                ).fallbackToDestructiveMigration().build()
                INSTANCE = instance
                instance
            }
        }
    }
}
