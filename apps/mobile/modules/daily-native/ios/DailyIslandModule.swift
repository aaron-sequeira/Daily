import ActivityKit
import ExpoModulesCore

/// The "Sunny today" Live Activity, driven by src/island/drive.ts.
public class DailyIslandModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DailyIsland")

    Function("isEnabled") { () -> Bool in
      guard #available(iOS 16.2, *) else { return false }
      return ActivityAuthorizationInfo().areActivitiesEnabled
    }

    AsyncFunction("show") { (stateJson: String, fallbackJson: String) in
      guard #available(iOS 16.2, *), let state = IslandStore.decode(stateJson) else { return }
      IslandStore.group?.set(fallbackJson, forKey: "island_fallback")
      let content = ActivityContent(state: state, staleDate: nil)
      let now = Date().timeIntervalSince1970 * 1000
      let started = IslandStore.group?.double(forKey: "island_started_ms") ?? 0
      // iOS ends a Live Activity after 8 h; restart before then so Sunny never disappears mid-day.
      if let current = Activity<SunnyAttributes>.activities.first, now - started < 7.5 * 3_600_000 {
        await current.update(content)
        return
      }
      for activity in Activity<SunnyAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      _ = try Activity.request(attributes: SunnyAttributes(), content: content, pushType: nil)
      IslandStore.group?.set(now, forKey: "island_started_ms")
    }

    AsyncFunction("end") {
      guard #available(iOS 16.2, *) else { return }
      for activity in Activity<SunnyAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }

    Function("takeActions") { () -> [[String: Any]] in
      let list = (IslandStore.group?.array(forKey: "island_actions") as? [[String: Any]]) ?? []
      IslandStore.group?.removeObject(forKey: "island_actions")
      return list
    }
  }
}
