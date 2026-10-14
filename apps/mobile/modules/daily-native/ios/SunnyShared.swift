import ActivityKit
import AppIntents
import Foundation
import UserNotifications

/// Compiled into both the app (DailyNative pod) and the Island widget. Keep the two copies identical (a test checks):
/// ActivityKit silently shows nothing when the app and the widget decode different ContentState shapes.
/// The keys match IslandState in src/island/state.ts.
struct SunnyAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var phase: String
    var mood: String
    var title: String
    var line: String
    var compact: String
    var timerStartMs: Double?
    var timerEndMs: Double?
    var color: String
    var icon: String
    var reminderId: Int?
    var canBreak: Bool
  }
}

enum IslandStore {
  static let group = UserDefaults(suiteName: "group.com.aaronalex.daily")

  static func decode(_ json: String) -> SunnyAttributes.ContentState? {
    guard let data = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(SunnyAttributes.ContentState.self, from: data)
  }

  /// The progress state the app sent last; buttons return the Island to it.
  static func fallback() -> SunnyAttributes.ContentState? {
    guard let json = group?.string(forKey: "island_fallback") else { return nil }
    return decode(json)
  }

  /// Queued for JS (DailyIsland.takeActions); reminderId -1 means none.
  static func push(action: String, reminderId: Int) {
    var list = (group?.array(forKey: "island_actions") as? [[String: Any]]) ?? []
    list.append(["action": action, "reminderId": reminderId, "atMs": Date().timeIntervalSince1970 * 1000])
    group?.set(list, forKey: "island_actions")
  }

  static func scheduleSnooze(title: String, body: String, reminderId: Int?) {
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default
    // ponytail: expo-notifications reads custom data from userInfo["body"]; reminderId is all a tap needs
    if let id = reminderId { content.userInfo = ["body": ["reminderId": id]] }
    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 15 * 60, repeats: false)
    let request = UNNotificationRequest(identifier: "island-snooze-\(reminderId ?? -1)", content: content, trigger: trigger)
    UNUserNotificationCenter.current().add(request) { _ in }
  }
}

@available(iOS 17.0, *)
struct IslandActionIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Sunny reminder action"

  @Parameter(title: "Action") var action: String
  @Parameter(title: "Reminder") var reminderId: Int

  init() {}

  init(action: String, reminderId: Int) {
    self.action = action
    self.reminderId = reminderId
  }

  func perform() async throws -> some IntentResult {
    IslandStore.push(action: action, reminderId: reminderId)
    for activity in Activity<SunnyAttributes>.activities {
      if action == "snooze" {
        let s = activity.content.state
        IslandStore.scheduleSnooze(title: s.title, body: s.line, reminderId: s.reminderId)
      }
      if let back = IslandStore.fallback() {
        await activity.update(ActivityContent(state: back, staleDate: nil))
      }
    }
    return .result()
  }
}
