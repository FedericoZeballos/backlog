const pad = (n: number) => String(n).padStart(2, '0');

/** The user's local date as YYYY-MM-DD. */
export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight as an ISO timestamp with offset. */
export function localMidnightISO(d = new Date()): string {
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = -midnight.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${localDate(midnight)}T00:00:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Parses YYYY-MM-DD as a local date (not UTC). */
function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

const dayFmt = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
const fullFmt = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDue(s: string): { text: string; tone: 'overdue' | 'today' | 'soon' | 'later' } {
  const today = parseDateOnly(localDate());
  const due = parseDateOnly(s);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { text: days === -1 ? 'Ayer' : `Venció ${dayFmt.format(due)}`, tone: 'overdue' };
  if (days === 0) return { text: 'Hoy', tone: 'today' };
  if (days === 1) return { text: 'Mañana', tone: 'soon' };
  return { text: dayFmt.format(due), tone: days <= 7 ? 'soon' : 'later' };
}

export function formatDayHeading(s: string): string {
  return formatDue(s).text.replace(/^./, (c) => c.toUpperCase());
}

export function formatDateTime(iso: string): string {
  return fullFmt.format(new Date(iso));
}

export function timeAgo(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'recién';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `hace ${days} d`;
  return dayFmt.format(new Date(iso));
}
