package com.footflash.app

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.VideoView

class IntroActivity : Activity() {

    private var finished = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        )

        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }

        val videoView = VideoView(this)
        val vvParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        )
        vvParams.gravity = Gravity.CENTER
        videoView.layoutParams = vvParams
        root.addView(videoView)
        setContentView(root)

        // URI corrigée : on utilise l'ID de ressource R.raw.intro (pas le nom de fichier)
        val videoUri = Uri.parse("android.resource://$packageName/${R.raw.intro}")
        videoView.setVideoURI(videoUri)

        videoView.setOnPreparedListener { mp ->
            mp.isLooping = false
            val vw = mp.videoWidth
            val vh = mp.videoHeight
            if (vw > 0 && vh > 0) {
                val dm = resources.displayMetrics
                val sw = dm.widthPixels
                val sh = dm.heightPixels
                val videoRatio = vw.toFloat() / vh.toFloat()
                val screenRatio = sw.toFloat() / sh.toFloat()
                val p = videoView.layoutParams as FrameLayout.LayoutParams
                if (videoRatio > screenRatio) {
                    p.width = sw
                    p.height = (sw / videoRatio).toInt()
                } else {
                    p.height = sh
                    p.width = (sh * videoRatio).toInt()
                }
                p.gravity = Gravity.CENTER
                videoView.layoutParams = p
            }
            mp.start()
        }

        videoView.setOnCompletionListener { showCreditThenMain(root, videoView) }

        videoView.setOnErrorListener { _, _, _ ->
            goToMain()
            true
        }

        root.setOnClickListener { goToMain() }
    }

    // Affiche "Offert par CADENCE Architectes Associés" ~1,8 s après la vidéo, puis lance l'app.
    private fun showCreditThenMain(root: FrameLayout, videoView: VideoView) {
        if (finished) return
        videoView.visibility = android.view.View.GONE
        val tv = TextView(this).apply {
            text = "✨ OFFERT PAR\nCADENCE Architectes Associés"
            setTextColor(Color.parseColor("#E8C45C"))
            textSize = 18f
            gravity = Gravity.CENTER
            val p = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            )
            p.gravity = Gravity.CENTER
            layoutParams = p
        }
        root.addView(tv)
        root.postDelayed({ goToMain() }, 1800)
    }

    private fun goToMain() {
        if (finished) return
        finished = true
        startActivity(Intent(this, MainActivity::class.java))
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
        finish()
    }
}
