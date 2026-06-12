package com.hybridapp

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.health.connect.client.PermissionController

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var bridge: HybridHealthBridge

    // Must be registered before onStart(); PermissionController contract is static.
    private val requestPermissions = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { granted: Set<String> ->
        bridge.onPermissionResult(granted)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        bridge = HybridHealthBridge(
            context = this,
            webView = webView,
            launchPermissions = { permissions -> requestPermissions.launch(permissions) },
        )

        webView.apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            // Required when loading from file:// so localStorage and ES modules work
            settings.allowFileAccessFromFileURLs = true
            settings.allowUniversalAccessFromFileURLs = true
            webViewClient = AppWebViewClient()
            addJavascriptInterface(bridge, "HybridHealthBridge")
            loadUrl(BuildConfig.APP_URL)
        }
    }

    @Deprecated("onBackPressed is deprecated but kept for API 26–32 compat")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    private inner class AppWebViewClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url.toString()
            // Stay in-app for the configured origin; everything else opens in the browser
            val appOrigin = BuildConfig.APP_URL.substringBefore("/", BuildConfig.APP_URL)
            return !url.startsWith("file://") && !url.startsWith(appOrigin)
        }
    }
}
