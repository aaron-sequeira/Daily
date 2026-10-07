package expo.modules.dailynative

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/** Runs the JS task registered as "DailyMinute" (apps/mobile/index.ts). Allowed while the app is in front too. */
class MinuteTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig =
    HeadlessJsTaskConfig("DailyMinute", Arguments.createMap(), 50_000, true)
}
