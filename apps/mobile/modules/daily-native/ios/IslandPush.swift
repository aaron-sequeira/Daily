import ActivityKit
import ExpoModulesCore
import Foundation

/// Starts watching Live Activity push tokens as the app launches. iOS also launches Daily in the background just to hand
/// over a new token (after a push-to-start), when its JavaScript never runs, so the tokens are posted from here.
public class IslandPushAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    IslandPush.observe()
    return true
  }
}

enum IslandPush {
  private static var observing = false
  private static let group = UserDefaults(suiteName: "group.com.aaronalex.daily")

  static func observe() {
    guard #available(iOS 17.2, *), !observing else { return }
    observing = true
    Task {
      for await data in Activity<SunnyAttributes>.pushToStartTokenUpdates { save(key: "push_start_token", field: "startToken", token: hex(data)) }
    }
    Task {
      for await activity in Activity<SunnyAttributes>.activityUpdates { watch(activity) }
    }
    for activity in Activity<SunnyAttributes>.activities { watch(activity) }
  }

  @available(iOS 16.2, *)
  static func watch(_ activity: Activity<SunnyAttributes>) {
    Task {
      for await data in activity.pushTokenUpdates { save(key: "push_activity_token", field: "activityToken", token: hex(data)) }
    }
    Task {
      for await state in activity.activityStateUpdates where state == .ended || state == .dismissed {
        if Activity<SunnyAttributes>.activities.allSatisfy({ $0.activityState != .active }) {
          save(key: "push_activity_token", field: "activityToken", token: nil)
        }
      }
    }
  }

  static func tokens() -> [String: Any] {
    ["start": group?.string(forKey: "push_start_token") ?? NSNull(), "activity": group?.string(forKey: "push_activity_token") ?? NSNull()]
  }

  static func configure(url: String, deviceId: String, secret: String) {
    group?.set(url, forKey: "push_url")
    group?.set(deviceId, forKey: "push_device_id")
    group?.set(secret, forKey: "push_secret")
  }

  private static func hex(_ data: Data) -> String { data.map { String(format: "%02x", $0) }.joined() }

  /// Keeps the token for the app's next /sync and tells the server now if the app already registered this phone.
  private static func save(key: String, field: String, token: String?) {
    if group?.string(forKey: key) == token { return }
    if let token = token { group?.set(token, forKey: key) } else { group?.removeObject(forKey: key) }
    guard let base = group?.string(forKey: "push_url"), let deviceId = group?.string(forKey: "push_device_id"),
          let secret = group?.string(forKey: "push_secret"), let url = URL(string: "\(base)/token") else { return }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "content-type")
    let body: [String: Any] = ["deviceId": deviceId, "secret": secret, field: token ?? NSNull()]
    request.httpBody = try? JSONSerialization.data(withJSONObject: body)
    URLSession.shared.dataTask(with: request).resume()
  }
}
