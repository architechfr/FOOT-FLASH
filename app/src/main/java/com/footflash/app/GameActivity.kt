package com.footflash.app

import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Activité dédiée aux mini-jeux Megadrive émulés.
 * Lancée depuis MainActivity via AndroidBridge.openGame(file).
 *
 * Le fichier HTML à charger est passé via Intent extra "game_file".
 * Par défaut : sensible_soccer_mobile.html.
 *
 * Mode paysage forcé via le manifest, plein écran immersif (barre système cachée).
 */
class GameActivity : Activity() {

    private var webView: WebView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Plein écran : passe sous l'encoche et derrière la barre système
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }

        // Récupère le nom du fichier HTML depuis l'Intent (par défaut Sensible Soccer)
        val gameFile = intent.getStringExtra("game_file") ?: "sensible_soccer_mobile.html"

        webView = WebView(this).apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                cacheMode = WebSettings.LOAD_DEFAULT
                mediaPlaybackRequiresUserGesture = false
                loadWithOverviewMode = true
                useWideViewPort = true
                mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            }
            webViewClient = WebViewClient()
            loadUrl("file:///android_asset/$gameFile")
        }
        setContentView(webView)

        hideSystemBars()
    }

    /**
     * Cache barre de statut + barre de navigation, mode "immersive sticky".
     * Pour réafficher : swipe depuis le bord. Pas d'appui accidentel possible.
     */
    private fun hideSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // API 30+ : nouvelle API WindowInsetsController
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let { ic ->
                ic.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                ic.systemBarsBehavior =
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            // API < 30 : ancienne API systemUiVisibility
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            or View.SYSTEM_UI_FLAG_FULLSCREEN
                            or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    )
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onPause() {
        super.onPause()
        webView?.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView?.onResume()
        hideSystemBars()
    }

    override fun onDestroy() {
        webView?.apply {
            stopLoading()
            loadUrl("about:blank")
            clearHistory()
            (parent as? android.view.ViewGroup)?.removeView(this)
            destroy()
        }
        webView = null
        super.onDestroy()
    }
}
