package expo.modules.dailynative

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat

/** Brings the Sunny service back after a reboot or app update — only if the user left it on. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!Chip.isEnabled(context)) return
    try {
      ContextCompat.startForegroundService(context, Intent(context, SunnyService::class.java))
    } catch (e: Exception) {
      Log.w("DailySunny", "could not restart after boot", e)
    }
  }
}
