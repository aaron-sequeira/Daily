import DeviceActivity
import ExpoModulesCore
import FamilyControls
import SwiftUI

/// Screen Time on iPhone: permission, "What counts?", milestone monitoring and the report view.
/// iOS never gives Daily per-app numbers; it gets milestones (src/screentime/milestones.ts) and shows the
/// report extension's view, whose data never leaves the extension.
enum ScreenTimeStore {
  static let group = UserDefaults(suiteName: "group.com.aaronalex.daily")

  static func selection() -> FamilyActivitySelection? {
    guard let data = group?.data(forKey: "screentime_selection") else { return nil }
    return try? PropertyListDecoder().decode(FamilyActivitySelection.self, from: data)
  }

  static func save(_ selection: FamilyActivitySelection) {
    if let data = try? PropertyListEncoder().encode(selection) { group?.set(data, forKey: "screentime_selection") }
  }

  static func isEmpty(_ s: FamilyActivitySelection) -> Bool {
    s.applicationTokens.isEmpty && s.categoryTokens.isEmpty && s.webDomainTokens.isEmpty
  }

  static func status() -> String {
    switch AuthorizationCenter.shared.authorizationStatus {
    case .approved: return "approved"
    case .denied: return "denied"
    default: return "notDetermined"
    }
  }
}

struct PickerSheet: View {
  @State private var selection: FamilyActivitySelection
  let done: (FamilyActivitySelection?) -> Void

  init(initial: FamilyActivitySelection, done: @escaping (FamilyActivitySelection?) -> Void) {
    _selection = State(initialValue: initial)
    self.done = done
  }

  var body: some View {
    NavigationView {
      FamilyActivityPicker(selection: $selection)
        .navigationTitle("What counts?")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) { Button("Cancel") { done(nil) } }
          ToolbarItem(placement: .confirmationAction) { Button("Done") { done(selection) } }
        }
    }
  }
}

/// Hosts Apple's DeviceActivityReport (drawn by targets/screentime-report) inside a React Native view.
struct ReportHost: View {
  let context: String
  /// Week contexts: the first day of the week shown (ms). The previous week is included for "vs last week".
  let startMs: Double

  var body: some View {
    let cal = Calendar.current
    let now = Date()
    let today = cal.startOfDay(for: now)
    if context == "weekChart" || context == "weekApps" {
      let weekStart = startMs > 0 ? Date(timeIntervalSince1970: startMs / 1000) : (cal.date(byAdding: .day, value: -6, to: today) ?? today)
      let from = cal.date(byAdding: .day, value: -7, to: weekStart) ?? weekStart
      let to = min(cal.date(byAdding: .day, value: 7, to: weekStart) ?? now, now)
      DeviceActivityReport(
        DeviceActivityReport.Context(context),
        filter: DeviceActivityFilter(segment: .daily(during: DateInterval(start: from, end: max(to, from))), users: .all, devices: .init([.iPhone]))
      )
    } else {
      DeviceActivityReport(
        DeviceActivityReport.Context("today"),
        filter: DeviceActivityFilter(segment: .hourly(during: DateInterval(start: today, end: now)), users: .all, devices: .init([.iPhone]))
      )
    }
  }
}

class ScreenTimeReportView: ExpoView {
  private let host = UIHostingController(rootView: AnyView(EmptyView()))

  var context = "today" {
    didSet { render() }
  }

  var startMs: Double = 0 {
    didSet {
      // the report extension reads the week shown from the App Group (it gets no other input)
      if startMs > 0 { ScreenTimeStore.group?.set(startMs, forKey: "report_week_start_ms") }
      render()
    }
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    host.view.backgroundColor = .clear
    // The report is for looking at: let every touch through so the screen's ScrollView can scroll over it.
    host.view.isUserInteractionEnabled = false
    addSubview(host.view)
    render()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    host.view.frame = bounds
  }

  private func render() {
    host.rootView = AnyView(ReportHost(context: context, startMs: startMs))
  }
}

public class DailyScreenTimeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DailyScreenTime")

    Function("authStatus") { () -> String in
      ScreenTimeStore.status()
    }

    AsyncFunction("requestAuth") { () async -> String in
      do {
        try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
      } catch {
        // denied or cancelled: the status says which
      }
      return ScreenTimeStore.status()
    }

    Function("hasSelection") { () -> Bool in
      guard let s = ScreenTimeStore.selection() else { return false }
      return !ScreenTimeStore.isEmpty(s)
    }

    /// Shows Apple's app picker; resolves true when the user tapped Done with something selected.
    AsyncFunction("pickApps") { (promise: Promise) in
      let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
      guard var top = scenes.flatMap({ $0.windows }).first(where: { $0.isKeyWindow })?.rootViewController else {
        promise.resolve(false)
        return
      }
      while let presented = top.presentedViewController { top = presented }
      let presenter = top
      var sheet: UIViewController?
      let view = PickerSheet(initial: ScreenTimeStore.selection() ?? FamilyActivitySelection()) { picked in
        if let picked = picked, !ScreenTimeStore.isEmpty(picked) { ScreenTimeStore.save(picked) }
        let ok = picked.map { !ScreenTimeStore.isEmpty($0) } ?? false
        sheet?.dismiss(animated: true) { promise.resolve(ok) }
      }
      let controller = UIHostingController(rootView: view)
      sheet = controller
      presenter.present(controller, animated: true)
    }.runOnQueue(.main)

    /// One threshold event per milestone minute over the whole day; the ActivityMonitor extension records them.
    AsyncFunction("startMonitoring") { (minutes: [Int]) in
      guard let s = ScreenTimeStore.selection(), !ScreenTimeStore.isEmpty(s) else { return }
      var events: [DeviceActivityEvent.Name: DeviceActivityEvent] = [:]
      for m in minutes where m > 0 {
        let threshold = DateComponents(hour: m / 60, minute: m % 60)
        let name = DeviceActivityEvent.Name("m_\(m)")
        if #available(iOS 17.4, *) {
          // a restart mid-day (new goal) still counts what was used since midnight
          events[name] = DeviceActivityEvent(
            applications: s.applicationTokens, categories: s.categoryTokens, webDomains: s.webDomainTokens,
            threshold: threshold, includesPastActivity: true)
        } else {
          events[name] = DeviceActivityEvent(
            applications: s.applicationTokens, categories: s.categoryTokens, webDomains: s.webDomainTokens, threshold: threshold)
        }
      }
      let schedule = DeviceActivitySchedule(
        intervalStart: DateComponents(hour: 0, minute: 0), intervalEnd: DateComponents(hour: 23, minute: 59), repeats: true)
      let center = DeviceActivityCenter()
      let name = DeviceActivityName("daily")
      center.stopMonitoring([name])
      try center.startMonitoring(name, during: schedule, events: events)
    }

    Function("milestones") { () -> [[String: Double]] in
      (ScreenTimeStore.group?.array(forKey: "milestones") as? [[String: Double]]) ?? []
    }

    /// The water reminder for the ActivityMonitor, which posts it as phone time passes (JSON, or "" when off).
    Function("setWater") { (json: String) in
      if json.isEmpty { ScreenTimeStore.group?.removeObject(forKey: "water") } else { ScreenTimeStore.group?.set(json, forKey: "water") }
    }

    /// Delete everything: the ActivityMonitor's copy too, or the next sync would bring the milestones back.
    Function("clearMilestones") {
      ScreenTimeStore.group?.removeObject(forKey: "milestones")
    }

    View(ScreenTimeReportView.self) {
      Prop("context") { (view: ScreenTimeReportView, context: String) in
        view.context = context
      }
      Prop("startMs") { (view: ScreenTimeReportView, startMs: Double) in
        view.startMs = startMs
      }
    }
  }
}
