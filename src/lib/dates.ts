// Date-only helpers for `experience_date` / trip dates ('YYYY-MM-DD' strings).
// All parsing/formatting is in LOCAL time — these are calendar dates, not instants,
// so `new Date('YYYY-MM-DD')` (which parses as UTC midnight) must be avoided.

export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayString(): string {
  return toDateString(new Date());
}

export function fromDateString(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

// "Today" / "Yesterday" / "Jun 12" (current year) / "Jun 12, 2025".
export function formatDay(s: string): string {
  if (s === todayString()) return 'Today';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (s === toDateString(yesterday)) return 'Yesterday';
  const d = fromDateString(s);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}

// Whole days from `a` to `b` (both date-only strings); positive when b is later.
export function daysBetween(a: string, b: string): number {
  return Math.round((fromDateString(b).getTime() - fromDateString(a).getTime()) / 86400000);
}

// Compact age of an ISO instant (created_at timestamps, not date-only strings):
// "now" / "5m" / "3h" / "2d", falling back to the calendar day when older.
export function timeAgo(iso: string): string {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  if (secs < 7 * 86400) return `${Math.floor(secs / 86400)}d`;
  return formatDay(toDateString(new Date(iso)));
}
