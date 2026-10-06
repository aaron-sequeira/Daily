export const MOODS = ['glowing', 'happy', 'alright', 'fading', 'sad'] as const;
export type Mood = typeof MOODS[number];

/** Spec §8. Keep in sync with the Kotlin twin (M3) — both run mood.cases.json. */
export function moodFor(phoneMin: number, goalMin: number): Mood {
  const ratio = phoneMin / Math.max(goalMin, 1);
  if (ratio < 0.5) return 'glowing';
  if (ratio < 0.8) return 'happy';
  if (ratio < 1) return 'alright';
  if (ratio < 1.3) return 'fading';
  return 'sad';
}

export function moodIndex(mood: Mood): number {
  return MOODS.indexOf(mood);
}

export const MOOD_COPY: Record<Mood, { title: string; quote: string }> = {
  glowing: { title: 'Sunny is glowing', quote: 'Best day ever!' },
  happy: { title: 'Sunny is happy', quote: 'Feeling bright.' },
  alright: { title: "Sunny's doing alright", quote: "I'm okay… could do better." },
  fading: { title: 'Sunny is fading', quote: 'Getting a bit dim in here.' },
  sad: { title: 'Sunny is sad', quote: "I've lost my shine." }
};
