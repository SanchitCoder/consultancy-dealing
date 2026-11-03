/** Display helpers: Indian number formatting, IST times said the way people say them, masked contact details. */
import { formatInTimeZone } from 'date-fns-tz';
import { TIMEZONE } from '@/lib/config';

const inrFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });

/** ₹1,50,000 */
export const inr = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : `${n < 0 ? '-' : ''}₹${inrFmt.format(Math.abs(Math.round(n)))}`);
/** ₹1.5L, ₹2.3Cr, or the full figure under a lakh. */
export function inrCompact(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const trim = (x: number) => String(Math.round(x * 10) / 10).replace(/\.0$/, '');
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5)}L`;
  return inr(n);
}
export const num = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : numFmt.format(n));
export const pctText = (n: number | null | undefined, digits = 0): string => (n === null || n === undefined ? '—' : `${n.toFixed(digits)}%`);

/** 6h, 1d 4h, 45 min */
export function hoursHuman(h: number | null | undefined): string {
  if (h === null || h === undefined) return '—';
  const abs = Math.abs(h);
  if (abs < 1) return `${Math.max(1, Math.round(abs * 60))} min`;
  if (abs < 48) return `${abs < 10 ? Math.round(abs * 10) / 10 : Math.round(abs)}h`.replace('.0h', 'h');
  const d = Math.floor(abs / 24);
  const rem = Math.round(abs - d * 24);
  return rem ? `${d}d ${rem}h` : `${d}d`;
}

export const toDate = (v: string | number | Date): Date => (v instanceof Date ? v : new Date(v));

/** "in 2h", "in 3 days", "14 min ago", "yesterday", "3 days ago" */
export function relativeTime(value: string | number | Date | null | undefined, now: number = Date.now()): string {
  if (value === null || value === undefined) return '—';
  const diff = toDate(value).getTime() - now;
  const abs = Math.abs(diff);
  const min = abs / 60_000;
  const hr = min / 60;
  const day = hr / 24;
  const fut = diff > 0;
  let body: string;
  if (min < 1) return 'just now';
  if (min < 60) body = `${Math.round(min)} min`;
  else if (hr < 24) body = `${Math.floor(hr)}h${Math.round(min - Math.floor(hr) * 60) >= 5 && hr < 6 ? ` ${Math.round(min - Math.floor(hr) * 60)}m` : ''}`;
  else if (day < 2) return fut ? 'tomorrow' : 'yesterday';
  else if (day < 60) body = `${Math.round(day)} days`;
  else body = `${Math.round(day / 30)} months`;
  return fut ? `in ${body}` : `${body} ago`;
}

/** 14 Mar, 4:30 pm */
export const formatIst = (v: string | number | Date | null | undefined, pattern = 'd MMM, h:mm a'): string => (v === null || v === undefined ? '—' : formatInTimeZone(toDate(v), TIMEZONE, pattern).replace(/\b(AM|PM)\b/, (m) => m.toLowerCase()));
export const formatIstDate = (v: string | number | Date | null | undefined): string => formatIst(v, 'd MMM yyyy');
/** "Today 4:30 pm", "Tomorrow 10:00 am", otherwise "Thu 14 Mar, 4:30 pm" */
export function calendarIst(v: string | number | Date | null | undefined, now: number = Date.now()): string {
  if (v === null || v === undefined) return '—';
  const key = (t: number) => formatInTimeZone(t, TIMEZONE, 'yyyy-MM-dd');
  const t = toDate(v).getTime();
  const time = formatIst(t, 'h:mm a');
  if (key(t) === key(now)) return `Today ${time}`;
  if (key(t) === key(now + 86_400_000)) return `Tomorrow ${time}`;
  if (key(t) === key(now - 86_400_000)) return `Yesterday ${time}`;
  return formatIst(t, 'EEE d MMM, h:mm a');
}

/** "in 1h 20m" with minutes while the call is close */
export function countdown(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return '—';
  const mins = Math.round(hours * 60);
  const abs = Math.abs(mins);
  const body = abs < 60 ? `${abs} min` : abs < 360 ? `${Math.floor(abs / 60)}h ${abs % 60}m` : abs < 2880 ? `${Math.round(abs / 60)}h` : `${Math.round(abs / 1440)} days`;
  if (abs < 2) return 'starting now';
  return mins > 0 ? `in ${body}` : `${body} ago`;
}

export function maskEmail(email: string | null | undefined): string {
  if (!email) return '—';
  const [user = '', domain = ''] = email.split('@');
  return `${user.slice(0, 1)}${'•'.repeat(Math.max(2, Math.min(5, user.length - 1)))}@${domain}`;
}
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const d = phone.replace(/\D/g, '');
  return d.length >= 10 ? `+${d.slice(0, d.length - 10)} ${d.slice(-10, -8)}••• ••${d.slice(-3)}`.replace('+ ', '+') : '••••';
}

/** Spreadsheet-safe CSV (also neutralises formula injection) */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

/** "iPhone", "Windows PC", "Gmail image proxy" from a user-agent string, without leaking the raw string. */
export function deviceLabel(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device';
  if (/GoogleImageProxy|ggpht/i.test(ua)) return 'Gmail image proxy (may be a pre-load)';
  if (/iPhone|iPad/i.test(ua)) return 'iPhone or iPad';
  if (/Android/i.test(ua)) return 'Android phone';
  if (/Windows/i.test(ua)) return 'Windows PC';
  if (/Macintosh|Mac OS/i.test(ua)) return 'Mac';
  return 'Other device';
}

/** "expires in 9 days", "expired 2 days ago" */
export function expiryText(expiresAt: string | null | undefined, now: number = Date.now()): string {
  if (!expiresAt) return 'No expiry set';
  const diff = Date.parse(expiresAt) - now;
  return diff > 0 ? `Expires ${relativeTime(expiresAt, now)}` : `Expired ${relativeTime(expiresAt, now)}`;
}
