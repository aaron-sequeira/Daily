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
  images: {
    'sunny-happy': './images/sunny-happy.png',
    'sunny-glowing': './images/sunny-glowing.png',
    'sunny-alright': './images/sunny-alright.png'
  }
};
