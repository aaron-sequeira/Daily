/** The "Sunny today" Live Activity: Dynamic Island and Lock Screen. */
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'Island',
  displayName: 'Daily',
  bundleIdentifier: '.island',
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit', 'AppIntents'],
  entitlements: { 'com.apple.security.application-groups': ['group.com.aaronalex.daily'] },
  images: Object.fromEntries(['glowing', 'happy', 'alright', 'fading', 'sad'].map((m) => [`sunny-${m}`, `./images/sunny-${m}.png`]))
};
