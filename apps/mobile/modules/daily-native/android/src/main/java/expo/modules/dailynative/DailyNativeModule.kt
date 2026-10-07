package expo.modules.dailynative

import android.Manifest
import android.app.AlarmManager
import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Process
import android.provider.Settings
import android.util.Base64
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream

class DailyNativeModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("DailyNative")

    Function("packageName") { context.packageName }

    Function("hasUsageAccess") { hasUsageAccess() }

    Function("openUsageAccessSettings") {
      context.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    Function("canScheduleExactAlarms") {
      if (Build.VERSION.SDK_INT < 31) true
      else (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
    }

    Function("isInCall") {
      val mode = (context.getSystemService(Context.AUDIO_SERVICE) as AudioManager).mode
      mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_IN_COMMUNICATION
    }

    Function("openExactAlarmSettings") {
      if (Build.VERSION.SDK_INT >= 31) {
        context.startActivity(
          Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + context.packageName))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
      }
    }

    Function("defaultLauncher") {
      val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
      context.packageManager.resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName
    }

    Function("startSunnyService") {
      Chip.setEnabled(context, true)
      ContextCompat.startForegroundService(context, Intent(context, SunnyService::class.java))
    }

    Function("stopSunnyService") {
      Chip.setEnabled(context, false)
      Chip.clearSaved(context)
      context.stopService(Intent(context, SunnyService::class.java))
      NotificationManagerCompat.from(context).cancel(Chip.ID)
    }

    Function("updateChip") { title: String, short: String, text: String, mood: String ->
      Chip.update(context, Chip.Data(title, short, text, mood))
    }

    Function("openBatterySettings") {
      try {
        context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      } catch (e: ActivityNotFoundException) {
        context.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }

    AsyncFunction("queryEvents") { fromMs: Double, toMs: Double -> queryEvents(fromMs.toLong(), toMs.toLong()) }

    AsyncFunction("appInfo") { packages: List<String> -> packages.map { appInfo(it) } }
  }

  private fun hasUsageAccess(): Boolean {
    val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = if (Build.VERSION.SDK_INT >= 29) {
      ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    } else {
      @Suppress("DEPRECATION")
      ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    }
    if (mode == AppOpsManager.MODE_DEFAULT) {
      return context.checkCallingOrSelfPermission(Manifest.permission.PACKAGE_USAGE_STATS) == PackageManager.PERMISSION_GRANTED
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }

  private fun queryEvents(from: Long, to: Long): List<Map<String, Any>> {
    val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val events = usm.queryEvents(from, to)
    val e = UsageEvents.Event()
    val out = ArrayList<Map<String, Any>>()
    while (events.hasNextEvent()) {
      events.getNextEvent(e)
      val type = Events.type(e.eventType) ?: continue
      out.add(mapOf("type" to type, "pkg" to e.packageName, "ts" to e.timeStamp.toDouble()))
    }
    return out
  }

  private fun appInfo(pkg: String): Map<String, Any?> {
    val pm = context.packageManager
    val ai = try {
      pm.getApplicationInfo(pkg, 0)
    } catch (e: Exception) {
      return mapOf("pkg" to pkg, "label" to pkg, "category" to -1, "icon" to null)
    }
    // One bad package must never fail the whole batch: fall back per field.
    val label = try { pm.getApplicationLabel(ai).toString() } catch (e: Exception) { pkg }
    val icon = try { iconPng(pm.getApplicationIcon(ai)) } catch (e: Exception) { null }
    val category = try { if (Build.VERSION.SDK_INT >= 26) ai.category else -1 } catch (e: Exception) { -1 }
    return mapOf("pkg" to pkg, "label" to label, "category" to category, "icon" to icon)
  }

  private fun iconPng(d: Drawable): String {
    val size = 96
    val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    d.setBounds(0, 0, size, size)
    d.draw(Canvas(bmp))
    val out = ByteArrayOutputStream()
    bmp.compress(Bitmap.CompressFormat.PNG, 100, out)
    return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
  }
}
