import DeviceActivity
import FamilyControls
import ManagedSettings
import SwiftUI

/// Draws the user's Screen Time inside Daily (Today's top half and the Week chart). Apple runs this extension in a
/// sandbox: what it reads here never leaves it, so the app itself only ever sees milestones.
@main
struct ScreenTimeReport: DeviceActivityReportExtension {
  var body: some DeviceActivityReportScene {
    TodayScene { TodayReportView(model: $0) }
    WeekScene { WeekReportView(model: $0) }
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
  static let track = Color(hex: 0xF5F1EC)
  static let card = Color.white

  /// Apple's categories onto Daily's colours (src/tracking/categories.ts).
  static func color(for category: String) -> Color {
    let c = category.lowercased()
    if c.contains("social") { return Color(hex: 0xF4C6C8) }
    if c.contains("productivity") || c.contains("finance") || c.contains("utilities") { return Color(hex: 0xD8D2FC) }
    if c.contains("entertainment") || c.contains("games") || c.contains("creativity") { return Color(hex: 0xF9DDB9) }
    if c.contains("education") || c.contains("reading") || c.contains("health") { return Color(hex: 0xBFEBD3) }
    if c.contains("travel") || c.contains("shopping") { return Color(hex: 0xCFE6FB) }
    return Color(hex: 0xE9E3DD)
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

// MARK: - Today

struct AppRow: Identifiable {
  let id: String
  let name: String
  let token: ApplicationToken?
  var minutes: Double
}

struct CategoryRow: Identifiable {
  let id: String
  var minutes: Double
}

struct TodayModel {
  var totalMin: Double = 0
  var pickups = 0
  var firstPickup: Date?
  var categories: [CategoryRow] = []
  var apps: [AppRow] = []
  var hours = Array(repeating: 0.0, count: 24)
}

struct TodayScene: DeviceActivityReportScene {
  let context = DeviceActivityReport.Context("today")
  let content: (TodayModel) -> TodayReportView

  func makeConfiguration(representing data: DeviceActivityResults<DeviceActivityData>) async -> TodayModel {
    var model = TodayModel()
    var categories: [String: Double] = [:]
    var apps: [String: AppRow] = [:]
    for await device in data {
      for await segment in device.activitySegments {
        let minutes = segment.totalActivityDuration / 60
        let hour = Calendar.current.component(.hour, from: segment.dateInterval.start)
        model.hours[hour] += minutes
        model.totalMin += minutes
        model.pickups += segment.totalPickupsWithoutApplicationActivity
        if let first = segment.firstPickup, model.firstPickup.map({ first < $0 }) ?? true { model.firstPickup = first }
        for await category in segment.categories {
          let name = category.category.localizedDisplayName ?? "Other"
          categories[name, default: 0] += category.totalActivityDuration / 60
          for await app in category.applications {
            let label = app.application.localizedDisplayName ?? app.application.bundleIdentifier ?? "App"
            let key = app.application.bundleIdentifier ?? label
            model.pickups += app.numberOfPickups
            if apps[key] == nil { apps[key] = AppRow(id: key, name: label, token: app.application.token, minutes: 0) }
            apps[key]?.minutes += app.totalActivityDuration / 60
          }
        }
      }
    }
    model.categories = categories.map { CategoryRow(id: $0.key, minutes: $0.value) }.filter { $0.minutes >= 1 }.sorted { $0.minutes > $1.minutes }
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
          ForEach(model.categories.prefix(4)) { c in
            VStack(alignment: .leading, spacing: 6) {
              Text(c.id).font(.system(size: 13, weight: .semibold)).foregroundStyle(Look.ink).lineLimit(1)
              Text(duration(c.minutes)).font(.system(size: 22)).foregroundStyle(Look.ink)
              Text("\(Int((c.minutes / max(model.totalMin, 1) * 100).rounded()))% of today").font(.system(size: 12)).foregroundStyle(Look.ink.opacity(0.6))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Look.color(for: c.id))
            .clipShape(RoundedRectangle(cornerRadius: 22))
          }
        }

        VStack(spacing: 0) {
          ForEach(Array(model.apps.prefix(5))) { app in
            HStack(spacing: 12) {
              if let token = app.token {
                Label(token).labelStyle(.iconOnly).frame(width: 28, height: 28)
              }
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

// MARK: - Week

struct DayTotal: Identifiable {
  let id: Date
  var minutes: Double
}

struct WeekModel {
  var days: [DayTotal] = []
}

struct WeekScene: DeviceActivityReportScene {
  let context = DeviceActivityReport.Context("week")
  let content: (WeekModel) -> WeekReportView

  func makeConfiguration(representing data: DeviceActivityResults<DeviceActivityData>) async -> WeekModel {
    let cal = Calendar.current
    var totals: [Date: Double] = [:]
    let today = cal.startOfDay(for: Date())
    for offset in 0..<7 {
      if let d = cal.date(byAdding: .day, value: -offset, to: today) { totals[d] = 0 }
    }
    for await device in data {
      for await segment in device.activitySegments {
        let day = cal.startOfDay(for: segment.dateInterval.start)
        totals[day, default: 0] += segment.totalActivityDuration / 60
      }
    }
    return WeekModel(days: Array(totals.map { DayTotal(id: $0.key, minutes: $0.value) }.sorted { $0.id < $1.id }.suffix(7)))
  }
}

struct WeekReportView: View {
  let model: WeekModel

  var body: some View {
    let top = max(model.days.map(\.minutes).max() ?? 0, 1)
    let total = model.days.reduce(0) { $0 + $1.minutes }
    let f = DateFormatter()
    f.dateFormat = "EEEEE"
    return VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .firstTextBaseline) {
        Text("Screen Time this week").font(.system(size: 15, weight: .semibold)).foregroundStyle(Look.ink)
        Spacer()
        Text("\(duration(total / Double(max(model.days.count, 1)))) a day").font(.system(size: 13)).foregroundStyle(Look.muted)
      }
      HStack(alignment: .bottom, spacing: 8) {
        ForEach(model.days) { d in
          VStack(spacing: 6) {
            Text(d.minutes >= 1 ? duration(d.minutes) : "").font(.system(size: 10)).foregroundStyle(Look.muted).lineLimit(1).minimumScaleFactor(0.7)
            RoundedRectangle(cornerRadius: 6)
              .fill(Calendar.current.isDateInToday(d.id) ? Look.ink : Color(hex: 0xF6B35E))
              .frame(height: max(4, 120 * d.minutes / top))
            Text(f.string(from: d.id)).font(.system(size: 12)).foregroundStyle(Look.muted)
          }
          .frame(maxWidth: .infinity)
        }
      }
      .frame(height: 160, alignment: .bottom)
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(Look.card)
    .clipShape(RoundedRectangle(cornerRadius: 22))
  }
}
