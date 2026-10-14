import DeviceActivity
import FamilyControls
import ManagedSettings
import SwiftUI

/// Draws the user's Screen Time inside Daily: Today's top half and the Week chart + top apps, in the same layout as
/// the Android screens (app/(tabs)/index.tsx, week.tsx). Apple runs this extension in a sandbox: what it reads here
/// never leaves it, so the app itself only ever sees milestones.
@main
struct ScreenTimeReport: DeviceActivityReportExtension {
  var body: some DeviceActivityReportScene {
    TodayScene { TodayReportView(model: $0) }
    WeekChartScene { WeekChartView(model: $0) }
    WeekAppsScene { WeekAppsView(model: $0) }
  }
}

// MARK: - Daily's look

extension Color {
  init(hex: UInt32) {
    self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
  }
}

private enum Look {
  static let bg = Color(hex: 0xFBF8F4)
  static let ink = Color(hex: 0x171717)
  static let muted = Color(hex: 0x77716C)
  static let line = Color(hex: 0xE7DFD8)
  static let track = Color(hex: 0xF5F1EC)
  static let card = Color.white
  static let down = Color(hex: 0x1F7A4D)
  static let up = Color(hex: 0x9A3B2E)
}

/// Daily's categories (src/tracking/categories.ts), in the same order and colours.
enum DailyCategory: String, CaseIterable, Identifiable {
  case social, messages, fun, learning, work, other
  var id: String { rawValue }

  var label: String {
    switch self {
    case .social: return "Social"
    case .messages: return "Messages"
    case .fun: return "Fun"
    case .learning: return "Learning"
    case .work: return "Work"
    case .other: return "Other"
    }
  }

  var color: Color {
    switch self {
    case .social: return Color(hex: 0xF4C6C8)
    case .messages: return Color(hex: 0xCFE6FB)
    case .fun: return Color(hex: 0xF9DDB9)
    case .learning: return Color(hex: 0xBFEBD3)
    case .work: return Color(hex: 0xD8D2FC)
    case .other: return Color(hex: 0xE9E3DD)
    }
  }

  /// Apple's Screen Time categories onto Daily's.
  init(apple name: String?) {
    let c = (name ?? "").lowercased()
    if c.contains("social") { self = .social }
    else if c.contains("entertainment") || c.contains("games") || c.contains("creativity") { self = .fun }
    else if c.contains("education") || c.contains("reading") || c.contains("health") { self = .learning }
    else if c.contains("productivity") || c.contains("finance") || c.contains("utilities") { self = .work }
    else { self = .other }
  }
}

private func duration(_ minutes: Double) -> String {
  let total = Int(minutes.rounded())
  let h = total / 60
  let m = total % 60
  if h == 0 { return "\(m)m" }
  return m == 0 ? "\(h)h" : "\(h)h \(m)m"
}

private func clock(_ date: Date) -> String {
  let f = DateFormatter()
  f.dateFormat = "h:mm a"
  f.amSymbol = "am"
  f.pmSymbol = "pm"
  return f.string(from: date)
}

struct AppRow: Identifiable {
  let id: String
  let name: String
  let token: ApplicationToken?
  let category: DailyCategory
  var minutes: Double
}

struct AppIcon: View {
  let app: AppRow
  var body: some View {
    if let token = app.token {
      Label(token).labelStyle(.iconOnly).frame(width: 28, height: 28)
    } else {
      Circle().fill(app.category.color).frame(width: 28, height: 28)
        .overlay(Text(String(app.name.prefix(1)).uppercased()).font(.system(size: 11, weight: .semibold)).foregroundStyle(Look.ink))
    }
  }
}

// MARK: - Today

struct CategoryTotal: Identifiable {
  let category: DailyCategory
  let minutes: Double
  var id: String { category.rawValue }
}

struct TodayModel {
  var totalMin: Double = 0
  var pickups = 0
  var firstPickup: Date?
  var categories: [CategoryTotal] = []
  var apps: [AppRow] = []
  var hours = Array(repeating: 0.0, count: 24)
}

struct TodayScene: DeviceActivityReportScene {
  let context = DeviceActivityReport.Context("today")
  let content: (TodayModel) -> TodayReportView

  func makeConfiguration(representing data: DeviceActivityResults<DeviceActivityData>) async -> TodayModel {
    var model = TodayModel()
    var categories: [DailyCategory: Double] = [:]
    var apps: [String: AppRow] = [:]
    for await device in data {
      for await segment in device.activitySegments {
        let minutes = segment.totalActivityDuration / 60
        model.hours[Calendar.current.component(.hour, from: segment.dateInterval.start)] += minutes
        model.totalMin += minutes
        model.pickups += segment.totalPickupsWithoutApplicationActivity
        if let first = segment.firstPickup, model.firstPickup.map({ first < $0 }) ?? true { model.firstPickup = first }
        for await category in segment.categories {
          let daily = DailyCategory(apple: category.category.localizedDisplayName)
          categories[daily, default: 0] += category.totalActivityDuration / 60
          for await app in category.applications {
            let label = app.application.localizedDisplayName ?? app.application.bundleIdentifier ?? "App"
            let key = app.application.bundleIdentifier ?? label
            model.pickups += app.numberOfPickups
            if apps[key] == nil { apps[key] = AppRow(id: key, name: label, token: app.application.token, category: daily, minutes: 0) }
            apps[key]?.minutes += app.totalActivityDuration / 60
          }
        }
      }
    }
    model.categories = categories.filter { $0.value >= 1 }.map { CategoryTotal(category: $0.key, minutes: $0.value) }.sorted { $0.minutes > $1.minutes }
    model.apps = apps.values.filter { $0.minutes >= 1 }.sorted { $0.minutes > $1.minutes }
    return model
  }
}

struct TodayReportView: View {
  let model: TodayModel

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      VStack(alignment: .leading, spacing: 6) {
        (Text("You spent ") + Text(duration(model.totalMin)).fontWeight(.semibold) + Text(" on your phone today"))
          .font(.system(size: 34))
          .tracking(-0.8)
          .foregroundStyle(Look.ink)
          .fixedSize(horizontal: false, vertical: true)
        Text(pickupLine).font(.system(size: 13)).foregroundStyle(Look.muted)
      }

      if model.categories.isEmpty {
        Text("Nothing yet today. Sunny's ready when you are.")
          .font(.system(size: 14)).foregroundStyle(Look.muted)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(16).background(Look.card).clipShape(RoundedRectangle(cornerRadius: 22))
      } else {
        Text("Where your time went").font(.system(size: 15, weight: .semibold)).foregroundStyle(Look.ink)
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
          ForEach(Array(model.categories.prefix(4))) { c in
            VStack(alignment: .leading, spacing: 6) {
              Text(c.category.label).font(.system(size: 13, weight: .semibold)).foregroundStyle(Look.ink)
              Text(duration(c.minutes)).font(.system(size: 22)).foregroundStyle(Look.ink)
              Text("\(Int((c.minutes / max(model.totalMin, 1) * 100).rounded()))% of today").font(.system(size: 12)).foregroundStyle(Look.ink.opacity(0.6))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(c.category.color)
            .clipShape(RoundedRectangle(cornerRadius: 22))
          }
        }

        VStack(spacing: 0) {
          ForEach(Array(model.apps.prefix(5))) { app in
            HStack(spacing: 12) {
              AppIcon(app: app)
              Text(app.name).font(.system(size: 15)).foregroundStyle(Look.ink).lineLimit(1)
              Spacer()
              Text(duration(app.minutes)).font(.system(size: 15)).foregroundStyle(Look.muted)
            }
            .padding(.vertical, 9)
          }
        }
        .padding(.horizontal, 16).padding(.vertical, 6)
        .background(Look.card).clipShape(RoundedRectangle(cornerRadius: 22))
      }

      VStack(alignment: .leading, spacing: 8) {
        Text("Today").font(.system(size: 12)).foregroundStyle(Look.muted)
        HourBars(hours: model.hours)
      }
      .padding(16).background(Look.card).clipShape(RoundedRectangle(cornerRadius: 18))
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(Look.bg)
  }

  private var pickupLine: String {
    let p = "\(model.pickups) \(model.pickups == 1 ? "pickup" : "pickups")"
    guard let first = model.firstPickup else { return p }
    return "\(p) · first at \(clock(first))"
  }
}

struct HourBars: View {
  let hours: [Double]

  var body: some View {
    let top = max(hours.max() ?? 0, 1)
    VStack(spacing: 4) {
      HStack(alignment: .bottom, spacing: 2) {
        ForEach(0..<24, id: \.self) { h in
          RoundedRectangle(cornerRadius: 2)
            .fill(hours[h] > 0 ? Look.ink : Look.track)
            .frame(height: max(3, 54 * hours[h] / top))
            .frame(maxWidth: .infinity)
        }
      }
      .frame(height: 54, alignment: .bottom)
      HStack {
        Text("12 am"); Spacer(); Text("6 am"); Spacer(); Text("12 pm"); Spacer(); Text("6 pm"); Spacer(); Text("11 pm")
      }
      .font(.system(size: 10)).foregroundStyle(Look.muted)
    }
  }
}

// MARK: - Week (the host passes the previous week too, for "vs last week")

struct DayBar: Identifiable {
  let id: Date
  var byCat: [DailyCategory: Double] = [:]
  var total: Double { byCat.values.reduce(0, +) }
}

struct WeekModel {
  var days: [DayBar] = []          // the 7 days of the week shown
  var avgMin: Double?               // over the days that have passed
  var lastAvgMin: Double?           // the week before
  var apps: [AppRow] = []           // minutes a day, this week
}

/// Reads daily segments; the first 7 days of the interval are "last week", the rest "this week".
private func readWeek(_ data: DeviceActivityResults<DeviceActivityData>, wantApps: Bool) async -> WeekModel {
  let cal = Calendar.current
  // The app stores the first day of the week it shows (DailyScreenTime's ReportHost); the extension may read it.
  let stored = UserDefaults(suiteName: "group.com.aaronalex.daily")?.double(forKey: "report_week_start_ms") ?? 0
  let start = stored > 0
    ? cal.startOfDay(for: Date(timeIntervalSince1970: stored / 1000))
    : (cal.date(byAdding: .day, value: -6, to: cal.startOfDay(for: Date())) ?? Date())
  var byDay: [Date: DayBar] = [:]
  var apps: [String: AppRow] = [:]
  for await device in data {
    for await segment in device.activitySegments {
      let day = cal.startOfDay(for: segment.dateInterval.start)
      var bar = byDay[day] ?? DayBar(id: day)
      for await category in segment.categories {
        let daily = DailyCategory(apple: category.category.localizedDisplayName)
        bar.byCat[daily, default: 0] += category.totalActivityDuration / 60
        guard wantApps else { continue }
        for await app in category.applications {
          let label = app.application.localizedDisplayName ?? app.application.bundleIdentifier ?? "App"
          let key = app.application.bundleIdentifier ?? label
          if apps[key] == nil { apps[key] = AppRow(id: key, name: label, token: app.application.token, category: daily, minutes: 0) }
          if day >= start { apps[key]?.minutes += app.totalActivityDuration / 60 } // this week only; a day's average below
        }
      }
      byDay[day] = bar
    }
  }
  let today = cal.startOfDay(for: Date())
  var model = WeekModel()
  model.days = (0..<7).compactMap { i in cal.date(byAdding: .day, value: i, to: start).map { byDay[$0] ?? DayBar(id: $0) } }
  let passed = model.days.filter { $0.id <= today }
  if !passed.isEmpty { model.avgMin = passed.reduce(0) { $0 + $1.total } / Double(passed.count) }
  let lastWeek = (1...7).compactMap { cal.date(byAdding: .day, value: -$0, to: start) }.compactMap { byDay[$0] }
  if !lastWeek.isEmpty { model.lastAvgMin = lastWeek.reduce(0) { $0 + $1.total } / 7 }
  if wantApps {
    let days = Double(max(passed.count, 1))
    model.apps = apps.values.map { var a = $0; a.minutes /= days; return a }.filter { $0.minutes >= 1 }.sorted { $0.minutes > $1.minutes }
  }
  return model
}

struct WeekChartScene: DeviceActivityReportScene {
  let context = DeviceActivityReport.Context("weekChart")
  let content: (WeekModel) -> WeekChartView
  func makeConfiguration(representing data: DeviceActivityResults<DeviceActivityData>) async -> WeekModel {
    await readWeek(data, wantApps: false)
  }
}

struct WeekAppsScene: DeviceActivityReportScene {
  let context = DeviceActivityReport.Context("weekApps")
  let content: (WeekModel) -> WeekAppsView
  func makeConfiguration(representing data: DeviceActivityResults<DeviceActivityData>) async -> WeekModel {
    await readWeek(data, wantApps: true)
  }
}

struct WeekChartView: View {
  let model: WeekModel

  var body: some View {
    let cal = Calendar.current
    let today = cal.startOfDay(for: Date())
    let top = max(model.days.map(\.total).max() ?? 0, 1)
    let shown = DailyCategory.allCases.filter { c in model.days.contains { ($0.byCat[c] ?? 0) >= 1 } }
    let f = DateFormatter()
    f.dateFormat = "EEE"
    return VStack(alignment: .leading, spacing: 0) {
      Text("Phone time · daily average").font(.system(size: 13)).foregroundStyle(Look.muted)
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Text(model.avgMin.map(duration) ?? "—").font(.system(size: 30, weight: .semibold)).tracking(-0.6).foregroundStyle(Look.ink)
        if let a = model.avgMin, let b = model.lastAvgMin, Int((a - b).rounded()) != 0 {
          Text("\(a < b ? "↓" : "↑") \(duration(abs(a - b))) vs last week")
            .font(.system(size: 13, weight: .semibold)).foregroundStyle(a < b ? Look.down : Look.up)
        }
      }
      .padding(.top, 4).padding(.bottom, 14)

      HStack(alignment: .bottom) {
        ForEach(model.days) { d in
          let isToday = d.id == today
          VStack(spacing: 6) {
            if d.id > today || d.total < 1 {
              RoundedRectangle(cornerRadius: 9).fill(Look.line).frame(width: 28, height: 6)
                .overlay(RoundedRectangle(cornerRadius: 9).stroke(Look.ink, lineWidth: isToday ? 2 : 0))
            } else {
              VStack(spacing: 0) {
                ForEach(DailyCategory.allCases.reversed().filter { (d.byCat[$0] ?? 0) > 0 }) { c in
                  Rectangle().fill(c.color).frame(height: max(1, 120 * (d.byCat[c] ?? 0) / top))
                }
              }
              .frame(width: 28)
              .clipShape(RoundedRectangle(cornerRadius: 9))
              .overlay(RoundedRectangle(cornerRadius: 9).stroke(Look.ink, lineWidth: isToday ? 2 : 0))
            }
            Text(isToday ? "Today" : f.string(from: d.id))
              .font(.system(size: 11, weight: isToday ? .semibold : .regular))
              .foregroundStyle(isToday ? Look.ink : Look.muted)
          }
          .frame(maxWidth: .infinity, alignment: .bottom)
        }
      }
      .frame(height: 150, alignment: .bottom)
      .padding(.top, 10)
      .overlay(alignment: .top) { Rectangle().fill(Look.line).frame(height: 1) }

      if !shown.isEmpty {
        HStack(spacing: 12) {
          ForEach(shown) { c in
            HStack(spacing: 5) {
              RoundedRectangle(cornerRadius: 3).fill(c.color).frame(width: 9, height: 9)
              Text(c.label).font(.system(size: 11)).foregroundStyle(Look.muted)
            }
          }
        }
        .padding(.top, 12)
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(Look.card)
    .clipShape(RoundedRectangle(cornerRadius: 20))
  }
}

struct WeekAppsView: View {
  let model: WeekModel

  var body: some View {
    let apps = Array(model.apps.prefix(5))
    let top = max(apps.first?.minutes ?? 0, 1)
    return VStack(alignment: .leading, spacing: 0) {
      Text("Top apps · a day").font(.system(size: 13)).foregroundStyle(Look.muted).padding(.bottom, 4)
      if apps.isEmpty {
        Text("No app time yet this week.").font(.system(size: 13)).foregroundStyle(Look.muted).padding(.vertical, 12)
      }
      ForEach(apps) { a in
        HStack(spacing: 10) {
          AppIcon(app: a)
          Text(a.name).font(.system(size: 13)).foregroundStyle(Look.ink).lineLimit(1).frame(width: 92, alignment: .leading)
          GeometryReader { g in
            ZStack(alignment: .leading) {
              Capsule().fill(Look.track)
              Capsule().fill(a.category.color).frame(width: g.size.width * a.minutes / top)
            }
          }
          .frame(height: 8)
          Text(duration(a.minutes)).font(.system(size: 13, weight: .semibold)).foregroundStyle(Look.ink).frame(width: 52, alignment: .trailing)
        }
        .frame(minHeight: 44)
      }
    }
    .padding(.horizontal, 16).padding(.vertical, 12)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(Look.card)
    .clipShape(RoundedRectangle(cornerRadius: 20))
  }
}
