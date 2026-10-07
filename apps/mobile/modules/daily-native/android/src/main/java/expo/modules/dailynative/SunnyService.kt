package expo.modules.dailynative

import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import com.facebook.react.HeadlessJsTaskService

/** Keeps Daily alive with the status chip and starts the DailyMinute JS task every 60 seconds. */
class SunnyService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val tick = object : Runnable {
    override fun run() {
      try {
        startService(Intent(this@SunnyService, MinuteTaskService::class.java))
        HeadlessJsTaskService.acquireWakeLockNow(this@SunnyService)
      } catch (e: Exception) {
        Log.w("DailySunny", "minute task not started", e)
      }
      handler.postDelayed(this, 60_000)
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (Build.VERSION.SDK_INT >= 26) getSystemService(NotificationManager::class.java).deleteNotificationChannel("sunny") // legacy channel
    val notification = Chip.build(this, Chip.load(this))
    try {
      if (Build.VERSION.SDK_INT >= 34) startForeground(Chip.ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      else startForeground(Chip.ID, notification)
    } catch (e: Exception) {
      Log.w("DailySunny", "could not start in the foreground", e)
      stopSelf()
      return START_NOT_STICKY
    }
    handler.removeCallbacks(tick)
    handler.post(tick)
    return START_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacks(tick)
    Bubble.hide(applicationContext)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
