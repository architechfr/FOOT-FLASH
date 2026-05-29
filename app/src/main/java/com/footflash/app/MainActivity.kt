package com.footflash.app

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.CalendarContract
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import java.util.Calendar
import java.util.TimeZone

class MainActivity : Activity() {

    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // ============================================================
        // Permet à la WebView de s'étendre sous status bar et nav bar.
        // Le HTML gère ensuite les zones avec env(safe-area-inset-*) en CSS.
        // (Sans ça, env() retourne 0 sur Android et le HTML déborde.)
        // ============================================================
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    )
        }

        // Permet de passer sous une encoche/notch éventuel
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }

        webView = WebView(this)
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = false
            loadWithOverviewMode = true
            useWideViewPort = true
        }

        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()
        webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")
        webView.loadUrl("file:///android_asset/index.html")
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun saveIcs(content: String, filename: String) {
            runOnUiThread {
                try {
                    val events = parseIcsEvents(content)
                    if (events.isEmpty()) return@runOnUiThread

                    val first = events[0]
                    val intent = Intent(Intent.ACTION_INSERT).apply {
                        data = CalendarContract.Events.CONTENT_URI
                        putExtra(CalendarContract.Events.TITLE, first.title)
                        putExtra(CalendarContract.Events.EVENT_LOCATION, first.location)
                        putExtra(CalendarContract.Events.DESCRIPTION, first.description)
                        putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, first.startMs)
                        putExtra(CalendarContract.EXTRA_EVENT_END_TIME, first.endMs)
                    }
                    try {
                        startActivity(intent)
                        if (events.size > 1) {
                            Toast.makeText(this@MainActivity,
                                "${events.size} matchs. Valide celui-ci puis reclique Agenda pour les suivants.",
                                Toast.LENGTH_LONG).show()
                        }
                    } catch (anf: ActivityNotFoundException) {
                        Toast.makeText(this@MainActivity,
                            "Aucune app calendrier détectée",
                            Toast.LENGTH_LONG).show()
                    }
                } catch (e: Exception) {
                    Toast.makeText(this@MainActivity,
                        "Erreur agenda",
                        Toast.LENGTH_SHORT).show()
                    e.printStackTrace()
                }
            }
        }

        @JavascriptInterface
        fun openGame(gameFile: String) {
            runOnUiThread {
                val intent = Intent(this@MainActivity, GameActivity::class.java)
                intent.putExtra("game_file", gameFile)
                startActivity(intent)
            }
        }

        @JavascriptInterface
        fun openGame() {
            openGame("sensible_soccer_mobile.html")
        }

        @JavascriptInterface
        fun openExternal(url: String) {
            runOnUiThread {
                try {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    startActivity(intent)
                } catch (e: Exception) {
                    Toast.makeText(this@MainActivity,
                        "Impossible d'ouvrir le navigateur",
                        Toast.LENGTH_LONG).show()
                    e.printStackTrace()
                }
            }
        }

        @JavascriptInterface
        fun isFootFlashApp(): Boolean = true
    }

    data class IcsEvent(
        val title: String,
        val location: String,
        val description: String,
        val startMs: Long,
        val endMs: Long
    )

    private fun parseIcsEvents(ics: String): List<IcsEvent> {
        val events = mutableListOf<IcsEvent>()
        val blocks = ics.split("BEGIN:VEVENT")
        for (i in 1 until blocks.size) {
            val block = blocks[i]
            val title = extractField(block, "SUMMARY")
            val location = extractField(block, "LOCATION")
            val description = extractField(block, "DESCRIPTION")
                .replace("\\n", "\n")
                .replace("\\,", ",")
            val dtStart = extractField(block, "DTSTART")
            val dtEnd = extractField(block, "DTEND")
            if (title.isNotEmpty() && dtStart.isNotEmpty()) {
                val startMs = parseIcsDate(dtStart)
                val endMs = if (dtEnd.isNotEmpty()) parseIcsDate(dtEnd) else startMs + 7_200_000L
                events.add(IcsEvent(title, location, description, startMs, endMs))
            }
        }
        return events
    }

    private fun extractField(block: String, field: String): String {
        val lines = block.split("\r\n", "\n")
        for (line in lines) {
            if (line.startsWith("$field:")) {
                return line.substring(field.length + 1).trim()
            }
        }
        return ""
    }

    private fun parseIcsDate(s: String): Long {
        return try {
            val year = s.substring(0, 4).toInt()
            val month = s.substring(4, 6).toInt() - 1
            val day = s.substring(6, 8).toInt()
            val hour = if (s.length > 9) s.substring(9, 11).toInt() else 0
            val min = if (s.length > 11) s.substring(11, 13).toInt() else 0
            val sec = if (s.length > 13) s.substring(13, 15).toInt() else 0
            val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
            cal.set(year, month, day, hour, min, sec)
            cal.set(Calendar.MILLISECOND, 0)
            cal.timeInMillis
        } catch (e: Exception) {
            System.currentTimeMillis()
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }
}