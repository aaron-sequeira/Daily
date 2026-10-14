/** Draws the user's Screen Time (Today and Week) inside Daily; its data never leaves this extension. */
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'device-activity-report',
  name: 'ScreenTimeReport',
  bundleIdentifier: '.ScreenTimeReport',
  deploymentTarget: '16.4',
  frameworks: ['DeviceActivity', 'SwiftUI', 'FamilyControls', 'ManagedSettings'],
  entitlements: {
    'com.apple.developer.family-controls': true,
    'com.apple.security.application-groups': ['group.com.aaronalex.daily']
  }
};
