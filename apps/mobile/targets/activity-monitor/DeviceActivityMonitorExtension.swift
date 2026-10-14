import DeviceActivity
import Foundation

/// Runs while Daily is closed. Each `m_<minutes>` event means the user's phone time today reached that many minutes;
/// it is appended to the App Group ("milestones"), where the app reads it (src/screentime/milestones.ts).
class DeviceActivityMonitorExtension: DeviceActivityMonitor {
  private let group = UserDefaults(suiteName: "group.com.aaronalex.daily")

  override func eventDidReachThreshold(_ event: DeviceActivityEvent.Name, activity: DeviceActivityName) {
    super.eventDidReachThreshold(event, activity: activity)
    guard event.rawValue.hasPrefix("m_"), let min = Double(event.rawValue.dropFirst(2)) else { return }
    let now = Date()
    let nowMs = now.timeIntervalSince1970 * 1000
    let midnightMs = Calendar.current.startOfDay(for: now).timeIntervalSince1970 * 1000
    var list = (group?.array(forKey: "milestones") as? [[String: Double]]) ?? []
    list = list.filter { ($0["atMs"] ?? 0) > nowMs - 15 * 86_400_000 } // this week and last week are all the app needs
    let today = list.filter { ($0["atMs"] ?? 0) >= midnightMs }
    if today.contains(where: { ($0["min"] ?? 0) >= min }) { return }
    // iOS sometimes fires thresholds early, even all at once. Phone time can never grow faster than the clock,
    // so drop any event that claims more use than there was time for since the last milestone (or midnight).
    let last = today.max { ($0["min"] ?? 0) < ($1["min"] ?? 0) }
    let lastMin = last?["min"] ?? 0
    let lastAtMs = last?["atMs"] ?? midnightMs
    guard min - lastMin <= (nowMs - lastAtMs) / 60_000 + 1 else { return }
    list.append(["min": min, "atMs": nowMs])
    group?.set(list, forKey: "milestones")
  }
}
