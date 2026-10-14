import DeviceActivity
import Foundation
import UserNotifications

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
    remindWater(lastMin: lastMin, min: min, midnightMs: midnightMs)
  }

  /// iPhone's "water after every hour of phone time": Daily's JavaScript can't see phone time while closed, so this
  /// extension posts it when phone time crosses the next multiple of the reminder's interval.
  private func remindWater(lastMin: Double, min: Double, midnightMs: Double) {
    guard let json = group?.string(forKey: "water"), let data = json.data(using: .utf8),
          let w = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let every = w["minutes"] as? Double, every > 0, let id = w["reminderId"] as? Int else { return }
    guard Int(min / every) > Int(lastMin / every) else { return }
    let content = UNMutableNotificationContent()
    content.title = (w["title"] as? String) ?? "Water"
    content.body = (w["body"] as? String) ?? "Time for a few sips."
    content.sound = .default
    content.categoryIdentifier = "water" // the "I had some" / "Snooze" buttons Daily registers
    content.userInfo = ["body": ["reminderId": id]]
    let request = UNNotificationRequest(identifier: "water-\(Int(midnightMs))-\(Int(min))", content: content, trigger: nil)
    UNUserNotificationCenter.current().add(request) { _ in }
  }
}
