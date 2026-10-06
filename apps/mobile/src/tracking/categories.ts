export const CATEGORIES = ['social', 'messages', 'fun', 'learning', 'work', 'other'] as const;
export type Category = typeof CATEGORIES[number];

export const CATEGORY_LOOK: Record<Category, { label: string; color: string }> = {
  social: { label: 'Social', color: '#F4C6C8' },
  messages: { label: 'Messages', color: '#CFE6FB' },
  fun: { label: 'Fun', color: '#F9DDB9' },
  learning: { label: 'Learning', color: '#BFEBD3' },
  work: { label: 'Work', color: '#D8D2FC' },
  other: { label: 'Other', color: '#E9E3DD' }
};

export function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);
}

// android.content.pm.ApplicationInfo.CATEGORY_*: GAME 0, AUDIO 1, VIDEO 2, IMAGE 3, SOCIAL 4, NEWS 5, MAPS 6, PRODUCTIVITY 7.
const ANDROID: Record<number, Category> = { 0: 'fun', 1: 'fun', 2: 'fun', 3: 'other', 4: 'social', 5: 'other', 6: 'other', 7: 'work' };

// Popular apps Android files wrongly (or not at all). ponytail: a short list; users fix the rest in Settings.
const KNOWN: Record<string, Category> = {
  'com.whatsapp': 'messages', 'com.whatsapp.w4b': 'messages', 'org.telegram.messenger': 'messages',
  'org.thoughtcrime.securesms': 'messages', 'com.google.android.gm': 'messages', 'com.google.android.apps.messaging': 'messages',
  'com.facebook.orca': 'messages', 'com.microsoft.office.outlook': 'messages', 'com.samsung.android.messaging': 'messages',
  'com.instagram.android': 'social', 'com.instagram.barcelona': 'social', 'com.facebook.katana': 'social',
  'com.zhiliaoapp.musically': 'social', 'com.ss.android.ugc.trill': 'social', 'com.snapchat.android': 'social',
  'com.twitter.android': 'social', 'com.reddit.frontpage': 'social', 'com.pinterest': 'social', 'com.discord': 'social',
  'com.google.android.youtube': 'fun', 'com.netflix.mediaclient': 'fun', 'com.spotify.music': 'fun',
  'in.startv.hotstar': 'fun', 'com.disney.disneyplus': 'fun', 'tv.twitch.android.app': 'fun', 'com.amazon.avod.thirdpartyclient': 'fun',
  'com.duolingo': 'learning', 'org.khanacademy.android': 'learning', 'com.google.android.apps.classroom': 'learning',
  'com.amazon.kindle': 'learning', 'com.quizlet.quizletandroid': 'learning', 'org.coursera.android': 'learning',
  'com.slack': 'work', 'com.microsoft.teams': 'work', 'notion.id': 'work', 'com.google.android.apps.docs': 'work',
  'com.google.android.calendar': 'work', 'us.zoom.videomeetings': 'work', 'com.linkedin.android': 'work'
};

export function categoryFor(pkg: string, androidCategory: number, userCategory: string | null): Category {
  if (isCategory(userCategory)) return userCategory;
  return KNOWN[pkg] ?? ANDROID[androidCategory] ?? 'other';
}
