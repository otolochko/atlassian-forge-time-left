const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const pad = (n) => String(n).padStart(2, '0');

/**
 * Countdown text: `2d 05h 12m` (1 day or more), `05h 12m 30s` (less than a day), `-1h 15m` (overdue).
 */
export function formatCountdown(ms) {
  const overdue = ms < 0;
  const abs = Math.abs(ms);
  const days = Math.floor(abs / DAY);
  const hours = Math.floor((abs % DAY) / HOUR);
  const minutes = Math.floor((abs % HOUR) / MIN);
  const seconds = Math.floor((abs % MIN) / SEC);

  if (days >= 1) return `${overdue ? '-' : ''}${days}d ${pad(hours)}h ${pad(minutes)}m`;
  if (overdue) return `-${hours >= 1 ? `${hours}h ` : ''}${minutes}m`;
  return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
}

/** Compact span for "to spare" / "missed by" / paused total: `1h 40m`, `2d 3h`, `<1m` */
export function formatSpan(ms) {
  const abs = Math.abs(ms);
  const days = Math.floor(abs / DAY);
  const hours = Math.floor((abs % DAY) / HOUR);
  const minutes = Math.floor((abs % HOUR) / MIN);

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes && days === 0) parts.push(`${minutes}m`);
  return parts.length ? parts.join(' ') : '<1m';
}

/** `Oct 8, 17:00` in the user's timezone and locale */
export function formatDateTime(ms, { locale, timeZone }) {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(new Date(ms));
}
