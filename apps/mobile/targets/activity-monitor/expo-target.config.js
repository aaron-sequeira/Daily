/** Records Screen Time milestones (one threshold event per step of phone time) into the App Group. */
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'device-activity-monitor',
  name: 'ActivityMonitor',
  bundleIdentifier: '.ActivityMonitor',
  deploymentTarget: '16.4',
  frameworks: ['DeviceActivity'],
  entitlements: {
    'com.apple.developer.family-controls': true,
    'com.apple.security.application-groups': ['group.com.aaronalex.daily']
  }
};
