package com.hybridapp

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.time.Instant

/**
 * Periodically syncs today's Health Connect data into SharedPreferences so the
 * data is available as a fast-load baseline the next time the app opens.
 *
 * Scheduled every 8 hours by MainActivity.scheduleHealthSync().
 * The cached JSON (key = KEY_SNAPSHOT) is stored under PREFS_NAME and can be
 * read natively; the JS bridge's normal readHealthData path always re-queries
 * Health Connect for the freshest data.
 */
class HealthSyncWorker(
    private val appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        if (HealthConnectClient.getSdkStatus(appContext) != HealthConnectClient.SDK_AVAILABLE) {
            return Result.success()
        }

        return try {
            val client = HealthConnectClient.getOrCreate(appContext)
            val end   = Instant.now()
            val start = end.minusSeconds(24L * 3600)
            val range = TimeRangeFilter.between(start, end)

            val steps = runCatching {
                client.readRecords(ReadRecordsRequest(StepsRecord::class, range))
                    .records.sumOf { it.count }
            }.getOrDefault(0L)

            val calories = runCatching {
                client.readRecords(ReadRecordsRequest(ActiveCaloriesBurnedRecord::class, range))
                    .records.sumOf { it.energy.inKilocalories }
            }.getOrDefault(0.0)

            val sleepMs = runCatching {
                client.readRecords(ReadRecordsRequest(SleepSessionRecord::class, range))
                    .records.sumOf { it.endTime.toEpochMilli() - it.startTime.toEpochMilli() }
            }.getOrDefault(0L)

            val snapshot = JSONObject().apply {
                put("steps",         steps)
                put("activeCalories", calories)
                put("sleepMs",       sleepMs)
                put("syncedAt",      end.toString())
            }.toString()

            appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit().putString(KEY_SNAPSHOT, snapshot).apply()

            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }

    companion object {
        const val PREFS_NAME   = "health_background_cache"
        const val KEY_SNAPSHOT = "last_snapshot"
        const val WORK_NAME    = "health_periodic_sync"
    }
}
