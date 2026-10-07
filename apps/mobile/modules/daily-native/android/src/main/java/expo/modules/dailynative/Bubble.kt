package expo.modules.dailynative

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.ComponentCallbacks
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
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
import android.view.WindowInsets
import android.view.WindowManager
import android.view.animation.OvershootInterpolator
import android.widget.ImageView
import android.widget.LinearLayout
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
  private const val CHIP_MS = 4_000L

  private val main by lazy { Handler(Looper.getMainLooper()) }
  private val cardToken = Any()
  private val lock = Any()

  private var bubble: ImageView? = null
  private var bubbleParams: WindowManager.LayoutParams? = null
  private var card: View? = null
  private var cardIsChip = false
  private var mood = "unknown"
  private var longPress: Runnable? = null
  private var snapAnim: ValueAnimator? = null
  private var callbacks: ComponentCallbacks? = null
  private var lastW = 0

  fun snapX(x: Int, size: Int, screenW: Int): Int = if (x + size / 2 < screenW / 2) 0 else screenW - size
  fun clamp(x: Int, y: Int, size: Int, screenW: Int, screenH: Int, topInset: Int, bottomInset: Int): Pair<Int, Int> =
    Pair(x.coerceIn(0, maxOf(0, screenW - size)), y.coerceIn(topInset, maxOf(topInset, screenH - bottomInset - size)))
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

  /** Screen width and height in px. */
  private fun screen(ctx: Context): Pair<Int, Int> {
    if (Build.VERSION.SDK_INT >= 30) {
      try {
        val b = wm(ctx).currentWindowMetrics.bounds
        return Pair(b.width(), b.height())
      } catch (e: Throwable) { /* fall through */ }
    }
    val dm = ctx.resources.displayMetrics
    return Pair(dm.widthPixels, dm.heightPixels)
  }

  /** Top and bottom keep-out in px: system bars when the platform tells us, else sensible dp margins. */
  private fun insets(ctx: Context): Pair<Int, Int> {
    var top = dp(ctx, 24)
    var bottom = dp(ctx, 24)
    try {
      if (Build.VERSION.SDK_INT >= 30) {
        val i = wm(ctx).currentWindowMetrics.windowInsets.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
        top = maxOf(top, i.top)
        bottom = maxOf(bottom, i.bottom)
      } else {
        val r = ctx.resources
        val sb = r.getIdentifier("status_bar_height", "dimen", "android")
        val nb = r.getIdentifier("navigation_bar_height", "dimen", "android")
        if (sb > 0) top = maxOf(top, r.getDimensionPixelSize(sb))
        if (nb > 0) bottom = maxOf(bottom, r.getDimensionPixelSize(nb))
      }
    } catch (e: Throwable) { /* keep the dp margins */ }
    return Pair(top, bottom)
  }

  private fun clampParams(ctx: Context, p: WindowManager.LayoutParams) {
    val (w, h) = screen(ctx)
    val (t, b) = insets(ctx)
    val c = clamp(p.x, p.y, p.width, w, h, t, b)
    p.x = c.first
    p.y = c.second
  }

  fun hiddenDay(c: Context): String? = prefs(c).getString("hidden_day", null)

  fun takeActions(c: Context): List<String> = synchronized(lock) {
    val p = prefs(c)
    val out = p.getStringSet("actions", null)?.toList() ?: emptyList()
    if (out.isNotEmpty()) p.edit().remove("actions").commit()
    out
  }

  private fun addAction(c: Context, action: String) = synchronized(lock) {
    val p = prefs(c)
    val set = HashSet(p.getStringSet("actions", emptySet()) ?: emptySet())
    set.add(action)
    p.edit().putStringSet("actions", set).commit()
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
      removeCard(ctx)
      addSpeech(ctx, title, body)
    }
  }

  fun hide(c: Context) {
    val ctx = c.applicationContext
    onMain { remove(ctx) }
  }

  private fun remove(ctx: Context) {
    removeCard(ctx)
    snapAnim?.cancel()
    snapAnim = null
    callbacks?.let { try { ctx.unregisterComponentCallbacks(it) } catch (e: Throwable) { /* gone already */ } }
    callbacks = null
    val v = bubble ?: return
    longPress?.let { v.removeCallbacks(it) }
    longPress = null
    bubble = null
    bubbleParams = null
    try { wm(ctx).removeViewImmediate(v) } catch (e: Throwable) { Log.w(TAG, "remove bubble", e) }
  }

  private fun removeCard(ctx: Context) {
    main.removeCallbacksAndMessages(cardToken)
    val v = card ?: return
    card = null
    cardIsChip = false
    try { wm(ctx).removeViewImmediate(v) } catch (e: Throwable) { Log.w(TAG, "remove card", e) }
  }

  @Suppress("DEPRECATION")
  private fun overlayParams(w: Int, h: Int, x: Int, y: Int, extraFlags: Int = 0) = WindowManager.LayoutParams(
    w, h,
    if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE,
    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
      WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or extraFlags,
    PixelFormat.TRANSLUCENT
  ).apply {
    gravity = Gravity.TOP or Gravity.START
    if (Build.VERSION.SDK_INT >= 28) layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
    this.x = x
    this.y = y
  }

  private fun openDaily(ctx: Context) {
    ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.let {
      ctx.startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }

  @SuppressLint("ClickableViewAccessibility")
  private fun add(ctx: Context) {
    val size = dp(ctx, SIZE_DP)
    val (sw, sh) = screen(ctx)
    val p = prefs(ctx)
    val params = overlayParams(size, size, p.getInt("x", sw - size), p.getInt("y", (sh * 0.4f).toInt()))
    clampParams(ctx, params)
    val view = ImageView(themed(ctx)).apply {
      setImageResource(Chip.moodImage(mood))
      contentDescription = "Sunny, opens Daily"
      val pad = dp(ctx, 4)
      setPadding(pad, pad, pad, pad)
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.WHITE)
        setStroke(dp(ctx, 1), Color.parseColor("#26000000"))
      }
    }
    val slop = ViewConfiguration.get(ctx).scaledTouchSlop.toFloat()
    var downX = 0f; var downY = 0f; var startX = 0; var startY = 0; var downAt = 0L
    var moved = false; var longPressed = false
    // Accessibility services drive these two directly; touches below call them too.
    view.setOnClickListener { try { openDaily(ctx) } catch (e: Throwable) { Log.w(TAG, "open daily", e) } }
    view.setOnLongClickListener { try { addChip(ctx) } catch (e: Throwable) { Log.w(TAG, "chip", e) }; true }
    val lp = Runnable { longPressed = true; view.performLongClick() }
    longPress = lp
    view.setOnTouchListener { _, ev ->
      try {
        when (ev.actionMasked) {
          MotionEvent.ACTION_DOWN -> {
            snapAnim?.cancel()
            if (cardIsChip) removeCard(ctx)
            downX = ev.rawX; downY = ev.rawY; startX = params.x; startY = params.y
            downAt = ev.eventTime; moved = false; longPressed = false
            view.postDelayed(lp, LONG_PRESS_MS)
          }
          MotionEvent.ACTION_MOVE -> {
            val dx = ev.rawX - downX
            val dy = ev.rawY - downY
            if (moved || dx * dx + dy * dy > slop * slop) {
              moved = true
              view.removeCallbacks(lp)
              if (!longPressed && bubble === view) {
                params.x = startX + dx.toInt()
                params.y = startY + dy.toInt()
                clampParams(ctx, params)
                wm(ctx).updateViewLayout(view, params)
                if (card != null) removeCard(ctx)
              }
            }
          }
          MotionEvent.ACTION_UP -> {
            view.removeCallbacks(lp)
            if (!longPressed) {
              if (!moved && isTap(ev.rawX - downX, ev.rawY - downY, ev.eventTime - downAt, slop)) view.performClick()
              else snap(ctx, view, params)
            }
          }
          MotionEvent.ACTION_CANCEL -> {
            view.removeCallbacks(lp)
            if (moved && !longPressed) snap(ctx, view, params)
          }
        }
      } catch (e: Throwable) { Log.w(TAG, "touch", e) }
      true
    }
    wm(ctx).addView(view, params)
    bubble = view
    bubbleParams = params
    lastW = sw
    val cb = object : ComponentCallbacks {
      override fun onConfigurationChanged(newConfig: Configuration) {
        onMain { reflow(ctx) }
      }
      @Suppress("OVERRIDE_DEPRECATION")
      override fun onLowMemory() {}
    }
    callbacks = cb
    ctx.registerComponentCallbacks(cb)
  }

  /** Screen size changed (rotation, fold): keep the side, clamp the height, save. */
  private fun reflow(ctx: Context) {
    val v = bubble ?: return
    val params = bubbleParams ?: return
    removeCard(ctx)
    snapAnim?.cancel()
    val (w, _) = screen(ctx)
    val onLeft = snapX(params.x, params.width, lastW) == 0
    lastW = w
    params.x = if (onLeft) 0 else w - params.width
    clampParams(ctx, params)
    wm(ctx).updateViewLayout(v, params)
    prefs(ctx).edit().putInt("x", params.x).putInt("y", params.y).apply()
  }

  private fun snap(ctx: Context, view: View, params: WindowManager.LayoutParams) {
    snapAnim?.cancel()
    val (w, _) = screen(ctx)
    clampParams(ctx, params)
    val to = snapX(params.x, params.width, w)
    val anim = ValueAnimator.ofInt(params.x, to).apply {
      duration = 250
      interpolator = OvershootInterpolator()
      addUpdateListener {
        try {
          if (bubble !== view) { cancel(); return@addUpdateListener }
          params.x = it.animatedValue as Int
          wm(ctx).updateViewLayout(view, params)
        } catch (e: Throwable) { cancel() }
      }
      addListener(object : AnimatorListenerAdapter() {
        private var cancelled = false
        override fun onAnimationCancel(animation: Animator) { cancelled = true }
        override fun onAnimationEnd(animation: Animator) {
          if (cancelled || bubble !== view) return
          params.x = to
          try { wm(ctx).updateViewLayout(view, params) } catch (e: Throwable) { /* gone */ }
          prefs(ctx).edit().putInt("x", to).putInt("y", params.y).apply()
        }
      })
    }
    snapAnim = anim
    anim.start()
  }

  private fun cardBackground(ctx: Context) = GradientDrawable().apply {
    setColor(Color.WHITE)
    cornerRadius = dp(ctx, 16).toFloat()
    setStroke(dp(ctx, 1), Color.parseColor("#26000000"))
  }

  private fun cardButton(ctx: Context, t: Context, label: String, onClick: () -> Unit) = TextView(t).apply {
    text = label
    setTextColor(Color.parseColor("#B45309"))
    setTypeface(null, Typeface.BOLD)
    textSize = 14f
    setPadding(dp(ctx, 10), dp(ctx, 8), dp(ctx, 10), dp(ctx, 8))
    setOnClickListener { try { onClick() } catch (e: Throwable) { Log.w(TAG, "card click", e) } }
  }

  /** Puts the card beside the bubble, on the side away from the screen edge, then arms its auto-hide. */
  private fun placeCard(ctx: Context, view: View, cardW: Int, estH: Int, ms: Long, chip: Boolean, extraFlags: Int = 0) {
    val bp = bubbleParams ?: return
    val (sw, sh) = screen(ctx)
    val (t, b) = insets(ctx)
    val onLeft = bp.x + bp.width / 2 < sw / 2
    val x = if (onLeft) bp.x + bp.width + dp(ctx, 8) else bp.x - cardW - dp(ctx, 8)
    val y = clamp(0, bp.y, estH, sw, sh, t, b).second
    wm(ctx).addView(view, overlayParams(cardW, WindowManager.LayoutParams.WRAP_CONTENT, maxOf(x, 0), y, extraFlags))
    card = view
    cardIsChip = chip
    main.postAtTime({ removeCard(ctx) }, cardToken, SystemClock.uptimeMillis() + ms)
  }

  @SuppressLint("ClickableViewAccessibility")
  private fun addChip(ctx: Context) {
    if (bubble == null) return
    removeCard(ctx)
    val t = themed(ctx)
    val chip = LinearLayout(t).apply {
      background = cardBackground(ctx)
      addView(cardButton(ctx, t, "Hide for today") {
        prefs(ctx).edit().putString("hidden_day", today()).apply()
        remove(ctx)
      })
      // Any touch outside the chip dismisses it.
      setOnTouchListener { _, ev ->
        if (ev.actionMasked == MotionEvent.ACTION_OUTSIDE) removeCard(ctx)
        false
      }
    }
    placeCard(ctx, chip, dp(ctx, 140), dp(ctx, 48), CHIP_MS, true, WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH)
  }

  private fun addSpeech(ctx: Context, title: String, body: String) {
    val bp = bubbleParams ?: return
    val t = themed(ctx)
    val (sw, _) = screen(ctx)
    val cardW = minOf(dp(ctx, 240), sw - bp.width - dp(ctx, 24))
    val view = LinearLayout(t).apply {
      orientation = LinearLayout.VERTICAL
      val pad = dp(ctx, 14)
      setPadding(pad, pad, pad, dp(ctx, 8))
      background = cardBackground(ctx)
    }
    view.addView(TextView(t).apply { text = title; setTypeface(null, Typeface.BOLD); setTextColor(Color.BLACK); textSize = 15f })
    view.addView(TextView(t).apply { text = body; setTextColor(Color.DKGRAY); textSize = 14f; setPadding(0, dp(ctx, 4), 0, dp(ctx, 4)) })
    val row = LinearLayout(t).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.END }
    row.addView(cardButton(ctx, t, "Thanks") { removeCard(ctx) })
    row.addView(cardButton(ctx, t, "Snooze 1 h") {
      addAction(ctx, "snooze")
      removeCard(ctx)
    })
    view.addView(row)
    placeCard(ctx, view, cardW, dp(ctx, 130), SPEECH_MS, false)
  }
}
