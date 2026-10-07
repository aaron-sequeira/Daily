import Svg, { Path } from 'react-native-svg';

const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  report: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z M14 3v6h6M8 13h8M8 17h5',
  week: 'M4 20h16M7 16v-5M12 16V7M17 16v-8',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  back: 'm15 6-6 6 6 6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  social: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  messages: 'M3 5h18v14H3z m0 2 9 6 9-6',
  fun: 'M3 5h18v14H3z M10 9l5 3-5 3z',
  learning: 'M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2zM22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z',
  work: 'M3 4h18v12H3z M8 20h8M12 16v4',
  other: 'M6 12h.01M12 12h.01M18 12h.01',
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  eyeOff: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M3 3l18 18',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  meal: 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 0-4 2-4 7h4',
  cup: 'M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  person: 'M12 2.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M5 9l7 1 7-1M12 10v5l-3 6M12 15l3 6',
  forward: 'm9 6 6 6-6 6',
  check: 'm5 12 5 5 9-10',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
  share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  target: 'M12 3v3M12 18v3M3 12h3M18 12h3 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, color = '#171717' }: { name: IconName; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={PATHS[name]} stroke={color} strokeWidth={name === 'other' ? 3 : 1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
