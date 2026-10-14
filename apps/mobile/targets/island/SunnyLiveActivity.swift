import ActivityKit
import SwiftUI
import WidgetKit

@main
struct IslandBundle: WidgetBundle {
  var body: some Widget {
    SunnyLiveActivity()
  }
}

extension Color {
  init(hex: String) {
    var v: UInt64 = 0
    Scanner(string: hex.replacingOccurrences(of: "#", with: "")).scanHexInt64(&v)
    self.init(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
  }
}

private let ink = Color(hex: "#171717")
private let cream = Color(hex: "#FBF8F4")

private func date(_ ms: Double) -> Date { Date(timeIntervalSince1970: ms / 1000) }

struct Face: View {
  let mood: String
  let size: CGFloat
  var body: some View {
    Image("sunny-\(mood)").resizable().scaledToFit().frame(width: size, height: size)
  }
}

/// A live countdown when the state has one (next reminder, break end), else its word ("now", "Ready").
struct Short: View {
  let s: SunnyAttributes.ContentState
  var body: some View {
    if s.compact.isEmpty, let end = s.timerEndMs, date(end) > Date() {
      Text(timerInterval: Date()...date(end), countsDown: true)
        .monospacedDigit()
        .multilineTextAlignment(.trailing)
        .frame(maxWidth: 56)
    } else {
      Text(s.compact.isEmpty ? "Daily" : s.compact)
    }
  }
}

struct Pill: View {
  let text: String
  let filled: Bool
  let onDark: Bool
  var body: some View {
    Text(text)
      .font(.system(size: 13, weight: .semibold))
      .padding(.horizontal, 12)
      .padding(.vertical, 7)
      .background(filled ? (onDark ? Color.white : ink) : (onDark ? Color.white.opacity(0.18) : ink.opacity(0.08)))
      .foregroundStyle(filled ? (onDark ? ink : Color.white) : (onDark ? Color.white : ink))
      .clipShape(Capsule())
  }
}

struct Buttons: View {
  let s: SunnyAttributes.ContentState
  let onDark: Bool
  var body: some View {
    let id = s.reminderId ?? -1
    HStack(spacing: 8) {
      if s.phase == "reminder" {
        if s.canBreak, let url = URL(string: "daily:///break?id=\(id)") {
          Link(destination: url) { Pill(text: "Take a break", filled: true, onDark: onDark) }
        }
        Button(intent: IslandActionIntent(action: "done", reminderId: id)) {
          Pill(text: "Done", filled: !s.canBreak, onDark: onDark)
        }.buttonStyle(.plain)
        Button(intent: IslandActionIntent(action: "snooze", reminderId: id)) {
          Pill(text: "Snooze 15m", filled: false, onDark: onDark)
        }.buttonStyle(.plain)
      } else if s.phase == "break" {
        Button(intent: IslandActionIntent(action: "endBreak", reminderId: id)) {
          Pill(text: "End break", filled: false, onDark: onDark)
        }.buttonStyle(.plain)
      }
    }
  }
}

struct Bar: View {
  let s: SunnyAttributes.ContentState
  var body: some View {
    if s.phase == "break", let a = s.timerStartMs, let b = s.timerEndMs, date(b) > date(a) {
      ProgressView(timerInterval: date(a)...date(b), countsDown: true) {
        EmptyView()
      } currentValueLabel: {
        EmptyView()
      }
      .tint(Color(hex: s.color))
    }
  }
}

struct LockView: View {
  let s: SunnyAttributes.ContentState
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 12) {
        Face(mood: s.mood, size: 44)
        VStack(alignment: .leading, spacing: 2) {
          Text(s.title).font(.system(size: 16, weight: .semibold)).foregroundStyle(ink)
          Text(s.line).font(.system(size: 13)).foregroundStyle(ink.opacity(0.65)).lineLimit(2)
        }
        Spacer(minLength: 8)
        Short(s: s).font(.system(size: 15, weight: .semibold)).foregroundStyle(ink)
      }
      Bar(s: s)
      Buttons(s: s, onDark: false)
    }
    .padding(16)
  }
}

struct SunnyLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: SunnyAttributes.self) { context in
      LockView(s: context.state)
        .activityBackgroundTint(cream)
        .activitySystemActionForegroundColor(ink)
        .widgetURL(URL(string: context.state.phase == "report" ? "daily:///report" : "daily:///"))
    } dynamicIsland: { context in
      let s = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Face(mood: s.mood, size: 44).padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Short(s: s).font(.system(size: 15, weight: .semibold)).foregroundStyle(Color(hex: s.color)).padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(alignment: .leading, spacing: 2) {
            Text(s.title).font(.system(size: 15, weight: .semibold))
            Text(s.line).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(2)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(spacing: 8) {
            Bar(s: s)
            Buttons(s: s, onDark: true)
          }
        }
      } compactLeading: {
        Face(mood: s.mood, size: 22)
      } compactTrailing: {
        Short(s: s).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color(hex: s.color))
      } minimal: {
        Face(mood: s.mood, size: 20)
      }
      .widgetURL(URL(string: s.phase == "report" ? "daily:///report" : "daily:///"))
      .keylineTint(Color(hex: s.color))
    }
  }
}
