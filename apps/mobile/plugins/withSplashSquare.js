const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/** Android 12+ draws its own splash (app icon in a circle on white) before the app runs. Make it the first frame of the
 * intro instead (src/ui/Intro.tsx): cream background, the dark icon square with only the horizon, centred.
 * The icon canvas is 240 dp and only the middle 160 dp circle shows, so the 112 dp square fits inside it. */
module.exports = function withSplashSquare(config) {
  return withDangerousMod(config, ['android', async (c) => {
    const res = path.join(c.modRequest.platformProjectRoot, 'app/src/main/res');
    fs.mkdirSync(path.join(res, 'drawable-xxxhdpi'), { recursive: true });
    fs.copyFileSync(path.join(c.modRequest.projectRoot, 'assets/splash-square.png'), path.join(res, 'drawable-xxxhdpi/splash_square.png'));
    // While JS loads, Expo holds drawing and the window background shows: make it the same picture (cream + square).
    fs.writeFileSync(path.join(res, 'drawable/splash_window.xml'), `<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:drawable="@color/splashscreen_background" />
  <item><bitmap android:gravity="center" android:src="@drawable/splash_square" /></item>
</layer-list>
`);
    const colors = path.join(res, 'values/colors.xml');
    fs.writeFileSync(colors, fs.readFileSync(colors, 'utf8').replace(/<color name="splashscreen_background">[^<]*<\/color>/, '<color name="splashscreen_background">#FBF8F4</color>'));
    const styles = path.join(res, 'values/styles.xml');
    fs.writeFileSync(styles, fs.readFileSync(styles, 'utf8').replace('@drawable/splashscreen_logo', '@drawable/splash_window')
      // MainActivity switches to AppTheme before the first draw (expo-splash-screen), so its background must match too.
      // Every screen paints its own background, so the square only ever shows while JS loads.
      .replace('<item name="android:windowBackground">@color/activityBackground</item>', '<item name="android:windowBackground">@drawable/splash_window</item>'));
    fs.mkdirSync(path.join(res, 'values-v31'), { recursive: true });
    fs.writeFileSync(path.join(res, 'values-v31/styles.xml'), `<resources xmlns:tools="http://schemas.android.com/tools">
  <style name="Theme.App.SplashScreen" parent="AppTheme">
    <item name="android:windowBackground">@drawable/splash_window</item>
    <item name="android:windowSplashScreenBackground">#FBF8F4</item>
    <item name="android:windowSplashScreenAnimatedIcon">@drawable/splash_square</item>
  </style>
</resources>
`);
    return c;
  }]);
};
