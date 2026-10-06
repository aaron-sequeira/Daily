import Svg, { Circle, ClipPath, Defs, Path, Rect } from 'react-native-svg';

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="Daily">
      <Defs><ClipPath id="sky"><Rect width="100" height="64" /></ClipPath></Defs>
      <Rect width="100" height="100" rx="24" fill="#171717" />
      <Circle cx="50" cy="64" r="21" fill="#F6B35E" clipPath="url(#sky)" />
      <Path d="M43.5 52 L43.5 54 M56.5 52 L56.5 54" stroke="#3A2412" strokeWidth={3.8} strokeLinecap="round" />
      <Path d="M44.8 57.6 Q50 61.4 55.2 57.6" stroke="#3A2412" strokeWidth={2.8} strokeLinecap="round" fill="none" />
      <Path d="M19.01,48.92 Q13.78,46.51 8.74,44.59 M31.48,34.27 Q28.33,30.03 25.87,25.86 M50.03,29.24 Q49.51,23.88 50.04,18.51 M67.62,34.54 Q71.02,29.32 74.51,23.81 M79.18,48.33 Q85.67,44.75 92.19,42.23" stroke="#F6B35E" strokeWidth={7} strokeLinecap="round" fill="none" />
      <Path d="M14,67 C17,66.58 26,64.5 32,64.5 C38,64.5 44,67 50,67 C56,67 62,64.58 68,64.5 C74,64.42 83,66.17 86,66.5" stroke="#FBF8F4" strokeWidth={6} strokeLinecap="round" fill="none" />
    </Svg>
  );
}
