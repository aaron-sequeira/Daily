package expo.modules.dailynative

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import android.util.TypedValue
import android.view.ContextThemeWrapper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.view.animation.OvershootInterpolator
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** The floating Sunny bubble: a WindowManager overlay plus a speech card. Everything runs on the main looper. */
object Bubble {
  private const val TAG = "DailyBubble"
  private const val PREFS = "daily_bubble"
  private const val SIZE_DP = 66
  private const val LONG_PRESS_MS = 500L
  private const val SPEECH_MS = 12_000L

  private val main by lazy { Handler(Looper.getMainLooper()) }
  private val speechToken = Any()

  private var bubble: ImageView? = null
  private var bubbleParams: WindowManager.LayoutParams? = null
  private var speech: View? = null
  private var mood = "unknown"

  fun snapX(x: Int, size: Int, screenW: Int): Int = if (x + size / 2 < screenW / 2) 0 else screenW - size
  fun isTap(dxPx: Float, dyPx: Float, ms: Long, slopPx: Float): Boolean = ms < 500 && dxPx * dxPx + dyPx * dyPx <= slopPx * slopPx

  private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  private fun today(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
  private fun dp(c: Context, v: Int): Int = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), c.resources.displayMetrics).toInt()
  private fun wm(c: Context) = c.getSystemService(Context.WINDOW_SERVICE) as WindowManager
  private fun themed(ctx: Context): Context = ContextThemeWrapper(ctx, android.R.style.Theme_Material_Light_NoActionBar)

  private fun onMain(block: () -> Unit) {
    main.post {
      try { block() } catch (e: Throwable) { Log.w(TAG, "bubble op failed", e) }
    }
  }

  fun hiddenDay(c: Context): String? = prefs(c).getString("hidden_day", null)

  fun takeActions(c: Context): List<String> {
    val p = prefs(c)
    val out = p.getStringSet("actions", null)?.toList() ?: emptyList()
    if (out.isNotEmpty()) p.edit().remove("actions").apply()
    return out
  }

  fun update(c: Context, visible: Boolean, newMood: String) {
    val ctx = c.applicationContext
    onMain {
      val want = visible && Settings.canDrawOverlays(ctx) && hiddenDay(ctx) != today()
      if (!want) {
        remove(ctx)
        return@onMain
      }
      if (bubble == null) {
        mood = newMood
        add(ctx)
      } else if (mood != newMood) {
        mood = newMood
        bubble?.setImageResource(Chip.moodImage(newMood))
      }
    }
  }

  fun speak(c: Context, title: String, body: String) {
    val ctx = c.applicationContext
    onMain {
      if (bubble == null || bubbleParams == null) return@onMain
      removeSpeech(ctx)
      addSpeech(ctx, title, body)
    }
  }

  fun hide(c: Context) {
    val ctx = c.applicationContext
    onMain { remove(ctx) }
  }

  private fun remove(ctx: Context) {
    removeSpeech(ctx)
    val v = bubble ?: return
    bubble = null
    bubbleParams = null
    try { if (v.isAttachedToWindow) wm(ctx).removeView(v) } catch (e: Throwable) { Log.w(TAG, "remove bubble", e) }
  }

  private fun removeSpeech(ctx: Context) {
    main.removeCallbacksAndMessages(speechToken)
    val v = speech ?: return
    speech = null
    try { if (v.isAttachedToWindow) wm(ctx).removeView(v) } catch (e: Throwable) { Log.w(TAG, "remove speech", e) }
  }

  private fun overlayParams(w: Int, h: Int, x: Int, y: Int) = WindowManager.LayoutParams(
    w, h,
    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
    PixelFormat.TRANSLUCENT
  ).apply {
    gravity = Gravity.TOP or Gravity.START
    this.x = x
    this.y = y
  }

  @SuppressLint("ClickableViewAccessibility")
  private fun add(ctx: Context) {
    val size = dp(ctx, SIZE_DP)
    val dm = ctx.resources.displayMetrics
    val p = prefs(ctx)
    val params = overlayParams(size, size, p.getInt("x", dm.widthPixels - size), p.getInt("y", (dm.heightPixels * 0.4f).toInt()))
    val view = ImageView(themed(ctx)).apply {
      setImageResource(Chip.moodImage(mood))
      contentDescription = "Sunny"
      val pad = dp(ctx, 4)
      setPadding(pad, pad, pad, pad)
      background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.WHITE) }
      elevation = dp(ctx, 6).toFloat()
    }
    val slop = ViewConfiguration.get(ctx).scaledTouchSlop.toFloat()
    var downX = 0f; var downY = 0f; var startX = 0; var startY = 0; var downAt = 0L
    var moved = false; var longPressed = false
    val longPress = Runnable {
      longPressed = true
      try {
        PopupMenu(view.context, view).apply {
          menu.add("Hide for today")
          setOnMenuItemClickListener {
            prefs(ctx).edit().putString("hidden_day", today()).apply()
            remove(ctx)
            true
          }
          show()
        }
      } catch (e: Throwable) { Log.w(TAG, "popup", e) }
    }
    view.setOnTouchListener { _, ev ->
      try {
        when (ev.actionMasked) {
          MotionEvent.ACTION_DOWN -> {
            downX = ev.rawX; downY = ev.rawY; startX = params.x; startY = params.y
            downAt = ev.eventTime; moved = false; longPressed = false
            view.postDelayed(longPress, LONG_PRESS_MS)
          }
          MotionEvent.ACTION_MOVE -> {
            val dx = ev.rawX - downX
            val dy = ev.rawY - downY
            if (moved || dx * dx + dy * dy > slop * slop) {
              moved = true
              view.removeCallbacks(longPress)
              if (!longPressed) {
                params.x = startX + dx.toInt()
                params.y = startY + dy.toInt()
                if (view.isAttachedToWindow) wm(ctx).updateViewLayout(view, params)
                if (speech != null) removeSpeech(ctx)
              }
            }
          }
          MotionEvent.ACTION_UP -> {
            view.removeCallbacks(longPress)
            if (!longPressed) {
              if (isTap(ev.rawX - downX, ev.rawY - downY, ev.eventTime - downAt, slop)) {
                ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.let {
                  ctx.startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
              } else {
                snap(ctx, view, params)
              }
            }
          }
          MotionEvent.ACTION_CANCEL -> view.removeCallbacks(longPress)
        }
      } catch (e: Throwable) { Log.w(TAG, "touch", e) }
      true
    }
    wm(ctx).addView(view, params)
    bubble = view
    bubbleParams = params
  }

  private fun snap(ctx: Context, view: View, params: WindowManager.LayoutParams) {
    val to = snapX(params.x, params.width, ctx.resources.displayMetrics.widthPixels)
    ValueAnimator.ofInt(params.x, to).apply {
      duration = 250
      interpolator = OvershootInterpolator()
      addUpdateListener {
        try {
          params.x = it.animatedValue as Int
          if (view.isAttachedToWindow) wm(ctx).updateViewLayout(view, params)
        } catch (e: Throwable) { cancel() }
      }
      addListener(object : AnimatorListenerAdapter() {
        override fun onAnimationEnd(animation: Animator) {
          params.x = to
          prefs(ctx).edit().putInt("x", to).putInt("y", params.y).apply()
        }
      })
      start()
    }
  }

  private fun addSpeech(ctx: Context, title: String, body: String) {
    val bp = bubbleParams ?: return
    val t = themed(ctx)
    val dm = ctx.resources.displayMetrics
    val cardW = minOf(dp(ctx, 240), dm.widthPixels - bp.width - dp(ctx, 24))
    val card = LinearLayout(t).apply {
      orientation = LinearLayout.VERTICAL
      val pad = dp(ctx, 14)
      setPadding(pad, pad, pad, dp(ctx, 8))
      background = GradientDrawable().apply { setColor(Color.WHITE); cornerRadius = dp(ctx, 16).toFloat() }
      elevation = dp(ctx, 6).toFloat()
    }
    card.addView(TextView(t).apply { text = title; setTypeface(null, Typeface.BOLD); setTextColor(Color.BLACK); textSize = 15f })
    card.addView(TextView(t).apply { text = body; setTextColor(Color.DKGRAY); textSize = 14f; setPadding(0, dp(ctx, 4), 0, dp(ctx, 4)) })
    val row = LinearLayout(t).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.END }
    fun button(label: String, onClick: () -> Unit) = TextView(t).apply {
      text = label
      setTextColor(Color.parseColor("#B45309"))
      setTypeface(null, Typeface.BOLD)
      textSize = 14f
      setPadding(dp(ctx, 10), dp(ctx, 8), dp(ctx, 10), dp(ctx, 8))
      setOnClickListener { try { onClick() } catch (e: Throwable) { Log.w(TAG, "speech click", e) } }
    }
    row.addView(button("Thanks") { removeSpeech(ctx) })
    row.addView(button("Snooze 1 h") {
      val p = prefs(ctx)
      val set = HashSet(p.getStringSet("actions", emptySet()) ?: emptySet())
      set.add("snooze")
      p.edit().putStringSet("actions", set).apply()
      removeSpeech(ctx)
    })
    card.addView(row)
    val onLeft = bp.x + bp.width / 2 < dm.widthPixels / 2
    val x = if (onLeft) bp.x + bp.width + dp(ctx, 8) else bp.x - cardW - dp(ctx, 8)
    wm(ctx).addView(card, overlayParams(cardW, WindowManager.LayoutParams.WRAP_CONTENT, maxOf(x, 0), bp.y))
    speech = card
    main.postAtTime({ removeSpeech(ctx) }, speechToken, SystemClock.uptimeMillis() + SPEECH_MS)
  }
}
