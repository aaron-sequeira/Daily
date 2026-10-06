import { formatDuration } from '../format';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function greeting(nowMs: number): string {
  const h = new Date(nowMs).getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  return 'Good evening';
}

function clock(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

export function dateLine(nowMs: number, firstPickupMs: number | null): string {
  const d = new Date(nowMs);
  const date = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return firstPickupMs === null ? date : `${date} · first pickup ${clock(firstPickupMs)}`;
}

export function goalLine(leftMin: number, goalMin: number): string {
  const goal = formatDuration(goalMin);
  if (Math.round(leftMin) > 0) return `${formatDuration(leftMin)} left before your ${goal} goal`;
  if (Math.round(leftMin) === 0) return `You've reached your ${goal} goal`;
  return `${formatDuration(-leftMin)} over your ${goal} goal`;
}
