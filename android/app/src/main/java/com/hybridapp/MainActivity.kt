package com.hybridapp

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.webkit.FileChooserParams
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.net.URLDecoder
import java.util.concurrent.TimeUnit

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var bridge: HybridHealthBridge

    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var lastBackPressTime = 0L

    // Must be registered before onStart(); PermissionController contract is static.
    private val requestPermissions = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { granted: Set<String> ->
        bridge.onPermissionResult(granted)
    }

    private val openDocumentLauncher = registerForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        val cb = fileChooserCallback
        fileChooserCallback = null
        cb?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
    }

    private val requestNotifPermLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* result is handled on the next notifyRestComplete call */ }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)

        // Edge-to-edge: WebView draws behind status/navigation bars.
        WindowCompat.setDecorFitsSystemWindows(window, false)

        setContentView(R.layout.activity_main)
        createNotificationChannels()

        webView = findViewById(R.id.webView)
        bridge = HybridHealthBridge(
            context = this,
            webView = webView,
            launchPermissions = { permissions -> requestPermissions.launch(permissions) },
            requestNotificationPermission = {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    requestNotifPermLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS)
                }
            },
        )

        configureWebView()
        // Registers OnBackPressedCallback for API 26+. AndroidX activity:1.8+ automatically
        // bridges this to OnBackInvokedCallback on API 33+ when
        // android:enableOnBackInvokedCallback="true" is set in the manifest, giving full
        // predictive-back gesture support without duplicate registration.
        registerBackHandler()
        scheduleHealthSync()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        webView.resumeTimers()
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
        webView.pauseTimers()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            // allowFileAccess flags are no longer needed: assets are served over
            // https://appassets.androidplatform.net via WebViewAssetLoader.
            settings.allowFileAccessFromFileURLs = false
            settings.allowUniversalAccessFromFileURLs = false
            settings.builtInZoomControls = false
            settings.setSupportZoom(false)
            overScrollMode = WebView.OVER_SCROLL_NEVER

            webViewClient = AppWebViewClient(assetLoader)
            webChromeClient = AppWebChromeClient()

            setDownloadListener { url, _, contentDisposition, mimetype, _ ->
                handleDownload(url, contentDisposition, mimetype)
            }

            addJavascriptInterface(bridge, "HybridHealthBridge")
            loadUrl(BuildConfig.APP_URL)
        }
    }

    private fun handleDownload(url: String, contentDisposition: String?, mimetype: String?) {
        when {
            url.startsWith("data:") -> {
                val commaIdx = url.indexOf(',')
                if (commaIdx < 0) return
                val meta = url.substring(5, commaIdx)
                val mimeType = meta.substringBefore(';').ifBlank { mimetype ?: "application/octet-stream" }
                val filename = URLUtil.guessFileName(url, contentDisposition, mimeType)
                    .ifBlank { if (mimeType.contains("json")) "export.json" else "export.csv" }
                val content = try {
                    if (meta.endsWith(";base64")) {
                        android.util.Base64.decode(url.substring(commaIdx + 1), android.util.Base64.DEFAULT)
                            .toString(Charsets.UTF_8)
                    } else {
                        URLDecoder.decode(url.substring(commaIdx + 1), "UTF-8")
                    }
                } catch (_: Exception) { return }
                bridge.saveTextFile(filename, content, mimeType)
            }
            url.startsWith("http://") || url.startsWith("https://") -> {
                val filename = URLUtil.guessFileName(url, contentDisposition, mimetype)
                val req = DownloadManager.Request(Uri.parse(url)).apply {
                    setNotificationVisibility(
                        DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
                    )
                    setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
                }
                (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
            }
        }
    }

    private fun registerBackHandler() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript(
                    "(window.__onAndroidBack ? window.__onAndroidBack() : 'exit')"
                ) { result ->
                    if (result?.trim('"') != "handled") handleExit()
                }
            }
        })
    }

    private fun handleExit() {
        val now = System.currentTimeMillis()
        if (now - lastBackPressTime < 2000L) {
            finish()
        } else {
            Toast.makeText(this, "Press back again to exit", Toast.LENGTH_SHORT).show()
            lastBackPressTime = now
        }
    }

    private fun createNotificationChannels() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(
                HybridHealthBridge.NOTIFICATION_CHANNEL_ID,
                "Rest Timer",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Notifies when a rest period ends during a backgrounded session"
            }
        )
    }

    private fun scheduleHealthSync() {
        if (HealthConnectClient.getSdkStatus(this) != HealthConnectClient.SDK_AVAILABLE) return
        val req = PeriodicWorkRequestBuilder<HealthSyncWorker>(8, TimeUnit.HOURS)
            .setInitialDelay(8, TimeUnit.HOURS)
            .build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            HealthSyncWorker.WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            req,
        )
    }

    private inner class AppWebViewClient(
        private val assetLoader: WebViewAssetLoader,
    ) : WebViewClientCompat() {

        override fun shouldInterceptRequest(
            view: WebView,
            request: WebResourceRequest,
        ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url.toString()
            // Keep in-app for the asset origin; open everything else in the browser.
            return !url.startsWith(APP_ORIGIN)
        }
    }

    private inner class AppWebChromeClient : WebChromeClient() {
        override fun onShowFileChooser(
            webView: WebView,
            filePathCallback: ValueCallback<Array<Uri>>,
            fileChooserParams: FileChooserParams,
        ): Boolean {
            // Cancel any pending callback to avoid locking the input element.
            fileChooserCallback?.onReceiveValue(null)
            fileChooserCallback = filePathCallback

            val types = fileChooserParams.acceptTypes
                .filter { it.isNotBlank() }
                .toTypedArray()
                .ifEmpty { arrayOf("*/*") }
            openDocumentLauncher.launch(types)
            return true
        }
    }

    companion object {
        private const val APP_ORIGIN = "https://appassets.androidplatform.net"
    }
}
