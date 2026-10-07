package expo.modules.dailynative

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/** The ongoing "status chip" notification. Its text comes from JS (the minute task); Kotlin only draws it. */
object Chip {
  const val ID = 4747
  const val CHANNEL = "sunny_status"
  private const val PREFS = "daily_chip"
  private const val NO_ACCESS_TEXT = "Turn on usage access so Sunny can see your day"

  data class Data(val title: String, val short: String, val text: String, val mood: String)

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun load(context: Context): Data {
    val p = prefs(context)
    return Data(
      p.getString("title", "Daily") ?: "Daily",
      p.getString("short", "Daily") ?: "Daily",
      p.getString("text", NO_ACCESS_TEXT) ?: NO_ACCESS_TEXT,
      p.getString("mood", "unknown") ?: "unknown"
    )
  }

  fun isEnabled(context: Context): Boolean = prefs(context).getBoolean("enabled", false)
  fun setEnabled(context: Context, on: Boolean) { prefs(context).edit().putBoolean("enabled", on).apply() }
  /** Forget the saved text, so a later start shows the neutral defaults instead of an old phone time. */
  fun clearSaved(context: Context) { prefs(context).edit().remove("title").remove("short").remove("text").remove("mood").apply() }

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT >= 26) {
      val nm = context.getSystemService(NotificationManager::class.java)
      if (nm.getNotificationChannel(CHANNEL) == null) {
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Sunny", NotificationManager.IMPORTANCE_DEFAULT).apply {
          setSound(null, null)
          enableVibration(false)
          setShowBadge(false)
        })
      }
    }
  }

  private fun moodImage(mood: String): Int = when (mood) {
    "glowing" -> R.drawable.sunny_glowing
    "happy" -> R.drawable.sunny_happy
    "alright" -> R.drawable.sunny_alright
    "fading" -> R.drawable.sunny_fading
    "sad" -> R.drawable.sunny_sad
    else -> R.drawable.sunny_unknown
  }

  fun build(context: Context, d: Data): Notification {
    ensureChannel(context)
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()
    val open = PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val b = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(R.drawable.ic_sunny_outline)
      .setLargeIcon(BitmapFactory.decodeResource(context.resources, moodImage(d.mood)))
      .setContentTitle(d.title)
      .setContentText(d.text)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .setShowWhen(false)
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      .setContentIntent(open)
    return b.build()
  }

  /** Called by JS every minute. Saves the text (so a restarted service shows the last known state) and redraws. */
  fun update(context: Context, d: Data) {
    if (!isEnabled(context)) return
    prefs(context).edit().putString("title", d.title).putString("short", d.short).putString("text", d.text).putString("mood", d.mood).apply()
    try { NotificationManagerCompat.from(context).notify(ID, build(context, d)) } catch (e: SecurityException) { Log.w("DailySunny", "no notification permission", e) }
  }
}
