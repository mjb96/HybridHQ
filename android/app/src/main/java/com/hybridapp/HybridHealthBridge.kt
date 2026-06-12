package com.hybridapp

import android.content.Context
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.concurrent.atomic.AtomicReference

/**
 * Android JavascriptInterface injected as `window.HybridHealthBridge`.
 *
 * JS contract:
 *   getAvailabilityStatus()                         → String sync
 *   requestPermissions(typesJson, callbackId)       → void; resolves via __hcCB[callbackId]
 *   readHealthData(startIso, endIso, callbackId)    → void; resolves via __hcCB[callbackId]
 *
 * Async results are delivered by calling window.__hcCB[callbackId](jsonString)
 * and then deleting the key. The JS side registers callbacks before each call.
 */
class HybridHealthBridge(
    private val context: Context,
    private val webView: WebView,
    private val launchPermissions: (Set<String>) -> Unit,
) {
    private val client by lazy { HealthConnectClient.getOrCreate(context) }
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val pendingPermCallbackId = AtomicReference<String?>()

    companion object {
        /** Full set of Health Connect permissions this app requests. */
        val ALL_PERMISSIONS: Set<String> = setOf(
            HealthPermission.getReadPermission(StepsRecord::class),
            HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
            HealthPermission.getReadPermission(SleepSessionRecord::class),
            HealthPermission.getReadPermission(HeartRateRecord::class),
            HealthPermission.getReadPermission(RestingHeartRateRecord::class),
            HealthPermission.getReadPermission(WeightRecord::class),
            HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        )

        private val TYPE_TO_PERMISSION = mapOf(
            "Steps"                 to HealthPermission.getReadPermission(StepsRecord::class),
            "ActiveCaloriesBurned"  to HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
            "SleepSession"          to HealthPermission.getReadPermission(SleepSessionRecord::class),
            "HeartRate"             to HealthPermission.getReadPermission(HeartRateRecord::class),
            "RestingHeartRate"      to HealthPermission.getReadPermission(RestingHeartRateRecord::class),
            "Weight"                to HealthPermission.getReadPermission(WeightRecord::class),
            "ExerciseSession"       to HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        )
    }

    // ── Synchronous bridge method ─────────────────────────────────────────────

    @JavascriptInterface
    fun getAvailabilityStatus(): String {
        return when (HealthConnectClient.getSdkStatus(context)) {
            HealthConnectClient.SDK_AVAILABLE                           -> "AVAILABLE"
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "NOT_INSTALLED"
            else                                                        -> "NOT_SUPPORTED"
        }
    }

    // ── Async bridge methods — results delivered via JS callback ─────────────

    @JavascriptInterface
    fun requestPermissions(typesJson: String, callbackId: String) {
        val types = runCatching {
            JSONArray(typesJson).let { arr -> (0 until arr.length()).map { arr.getString(it) } }
        }.getOrDefault(emptyList())

        val permissions = types.mapNotNull { TYPE_TO_PERMISSION[it] }.toSet()
            .ifEmpty { ALL_PERMISSIONS }

        pendingPermCallbackId.set(callbackId)
        webView.post { launchPermissions(permissions) }
    }

    /** Called by MainActivity after the Health Connect permission activity returns. */
    fun onPermissionResult(granted: Set<String>) {
        val callbackId = pendingPermCallbackId.getAndSet(null) ?: return
        val grantedTypes = TYPE_TO_PERMISSION.entries.filter { it.value in granted }.map { it.key }
        val deniedTypes  = TYPE_TO_PERMISSION.keys.filter { it !in grantedTypes }
        val json = JSONObject().apply {
            put("granted", JSONArray(grantedTypes))
            put("denied",  JSONArray(deniedTypes))
        }.toString()
        resolveCallback(callbackId, json)
    }

    @JavascriptInterface
    fun readHealthData(startIso: String, endIso: String, callbackId: String) {
        scope.launch {
            val json = runCatching { fetchAll(startIso, endIso) }.getOrElse { "{}" }
            resolveCallback(callbackId, json)
        }
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    private fun resolveCallback(id: String, json: String) {
        val escaped = json.replace("\\", "\\\\").replace("'", "\\'")
        webView.post {
            webView.evaluateJavascript(
                "if(window.__hcCB&&window.__hcCB['$id'])" +
                "{window.__hcCB['$id']('$escaped');delete window.__hcCB['$id'];}",
                null,
            )
        }
    }

    private suspend fun fetchAll(startIso: String, endIso: String): String {
        val range = TimeRangeFilter.between(Instant.parse(startIso), Instant.parse(endIso))

        val steps = runCatching {
            client.readRecords(ReadRecordsRequest(StepsRecord::class, range))
                .records.sumOf { it.count }
        }.getOrDefault(0L)

        val calories = runCatching {
            client.readRecords(ReadRecordsRequest(ActiveCaloriesBurnedRecord::class, range))
                .records.sumOf { it.energy.inKilocalories }
        }.getOrDefault(0.0)

        val sleepArr = JSONArray()
        runCatching {
            client.readRecords(ReadRecordsRequest(SleepSessionRecord::class, range)).records
        }.getOrDefault(emptyList()).forEach { s ->
            sleepArr.put(JSONObject().apply {
                put("durationMs", s.endTime.toEpochMilli() - s.startTime.toEpochMilli())
                put("score",      JSONObject.NULL)
                put("startTime",  s.startTime.toString())
            })
        }

        val hrArr = JSONArray()
        runCatching {
            client.readRecords(ReadRecordsRequest(HeartRateRecord::class, range)).records
        }.getOrDefault(emptyList()).forEach { r ->
            r.samples.forEach { s ->
                hrArr.put(JSONObject().apply {
                    put("bpm",  s.beatsPerMinute)
                    put("time", s.time.toString())
                })
            }
        }

        val rhr = runCatching {
            client.readRecords(ReadRecordsRequest(RestingHeartRateRecord::class, range))
                .records.lastOrNull()?.beatsPerMinute
        }.getOrNull()

        val weightKg = runCatching {
            client.readRecords(ReadRecordsRequest(WeightRecord::class, range))
                .records.lastOrNull()?.weight?.inKilograms
        }.getOrNull()

        val exArr = JSONArray()
        runCatching {
            client.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, range)).records
        }.getOrDefault(emptyList()).forEach { e ->
            exArr.put(JSONObject().apply {
                put("exerciseType",  e.exerciseType.toString())
                put("durationMs",    e.endTime.toEpochMilli() - e.startTime.toEpochMilli())
                put("totalCalories", 0)
                put("avgHeartRate",  JSONObject.NULL)
                put("totalDistance", JSONObject.NULL)
                put("startTime",     e.startTime.toString())
            })
        }

        return JSONObject().apply {
            put("steps",            steps)
            put("activeCalories",   calories)
            put("sleepSessions",    sleepArr)
            put("heartRateSamples", hrArr)
            put("restingHeartRate", rhr ?: JSONObject.NULL)
            put("weightKg",         weightKg ?: JSONObject.NULL)
            put("exerciseSessions", exArr)
        }.toString()
    }
}
