package expo.modules.dailynative

/** UsageEvents.Event types Daily reads, as the strings JS expects (see src/tracking/ingest.ts RawEvent). */
object Events {
  fun type(code: Int): String? = when (code) {
    1 -> "resumed"      // ACTIVITY_RESUMED (MOVE_TO_FOREGROUND before API 29)
    2 -> "paused"       // ACTIVITY_PAUSED
    15 -> "screen_on"   // SCREEN_INTERACTIVE
    16 -> "screen_off"  // SCREEN_NON_INTERACTIVE
    18 -> "unlock"      // KEYGUARD_HIDDEN
    26 -> "screen_off"  // DEVICE_SHUTDOWN: closes an app left open when the phone powers off
    else -> null
  }
}
