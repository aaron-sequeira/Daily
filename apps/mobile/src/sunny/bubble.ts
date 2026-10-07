const GAME = 0;
const VIDEO = 2; // Android ApplicationInfo categories (spec §9.5: hidden while a full-screen app is in front)

export function bubbleShows(i: {
  plus: boolean; on: boolean; serviceOn: boolean; canDraw: boolean; hiddenDay: string | null; today: string; appActive: boolean; openAndroidCategory: number | null;
}): boolean {
  if (!i.plus || !i.on || !i.serviceOn || !i.canDraw || i.appActive) return false;
  if (i.hiddenDay === i.today) return false;
  // ponytail: games/videos stand in for "full screen" — Android won't say whether another app is immersive.
  return i.openAndroidCategory !== GAME && i.openAndroidCategory !== VIDEO;
}
