/** Local-only usage analytics. Never sends data to Cloudflare, HF or third parties.
 * Timings approximate foreground, non-idle time, not proof of attention. */
const KEY = 'taiyou.usage-analytics.v1';
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const BOOK_RE = /^[a-f0-9]{24}$/i;
const MAX_DAYS = 400;
const MAX_BOOKS = 2500;
const MAX_COUNTER = 30 * 365 * 24 * 60 * 60 * 1000;

export interface UsageDay { appMs: number; readingMs: number; offlineMs: number }
export interface UsageAnalytics {
  version: 1;
  enabled: boolean;
  days: Record<string, UsageDay>;
  bookReadingMs: Record<string, number>;
}

export function emptyUsage(enabled = true): UsageAnalytics {
  return { version: 1, enabled, days: {}, bookReadingMs: {} };
}
function safeMs(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(MAX_COUNTER, Math.max(0, Math.round(value))) : 0;
}
export function localDayKey(date = new Date()): string {
  return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
}
export function readUsage(): UsageAnalytics {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyUsage();
    const decoded: unknown = JSON.parse(raw);
    if (!decoded || typeof decoded !== 'object' || (decoded as { version?: number }).version !== 1) return emptyUsage();
    const payload = decoded as Partial<UsageAnalytics>;
    const result = emptyUsage(payload.enabled !== false);
    if (payload.days && typeof payload.days === 'object') {
      for (const key of Object.keys(payload.days).filter(k => DAY_RE.test(k)).sort().slice(-MAX_DAYS)) {
        const day = payload.days[key] as Partial<UsageDay> | undefined;
        if (!day || typeof day !== 'object') continue;
        result.days[key] = { appMs: safeMs(day.appMs), readingMs: safeMs(day.readingMs), offlineMs: safeMs(day.offlineMs) };
      }
    }
    if (payload.bookReadingMs && typeof payload.bookReadingMs === 'object') {
      for (const id of Object.keys(payload.bookReadingMs).filter(k => BOOK_RE.test(k)).slice(0,MAX_BOOKS)) {
        result.bookReadingMs[id] = safeMs(payload.bookReadingMs[id]);
      }
    }
    return result;
  } catch { return emptyUsage(); }
}

function writeUsage(data: UsageAnalytics): void {
  try { localStorage.setItem(KEY, JSON.stringify(data)); }
  catch { /* Analytics must never interfere with reading or offline storage. */ }
}
function notify() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('taiyou-usage-changed'));
}
export function setUsageEnabled(enabled: boolean): UsageAnalytics {
  const usage = readUsage(); usage.enabled = enabled;
  writeUsage(usage); notify();
  return usage;
}
export function clearUsage(): UsageAnalytics {
  const reset = emptyUsage(readUsage().enabled);
  writeUsage(reset); notify(); return reset;
}

/** A single foreground slice, capped to avoid sleep/background timer inflation. */
export function recordUsage(elapsedMs: number, bookId: string | null, offline: boolean, now = new Date()): UsageAnalytics {
  const usage = readUsage();
  const slice = Math.min(30_000, safeMs(elapsedMs));
  if (!usage.enabled || slice === 0) return usage;
  const day = localDayKey(now);
  const entry = usage.days[day] ?? { appMs: 0, readingMs: 0, offlineMs: 0 };
  entry.appMs = safeMs(entry.appMs + slice);
  if (offline) entry.offlineMs = safeMs(entry.offlineMs + slice);
  if (bookId && BOOK_RE.test(bookId)) {
    entry.readingMs = safeMs(entry.readingMs + slice);
    usage.bookReadingMs[bookId] = safeMs((usage.bookReadingMs[bookId] || 0) + slice);
  }
  usage.days[day] = entry;
  // Keep only the most recent 400 calendar days. Storage stays bounded.
  const days = Object.keys(usage.days).sort();
  for (const expired of days.slice(0,-MAX_DAYS)) delete usage.days[expired];
  writeUsage(usage); notify();
  return usage;
}

export function readableDuration(ms: number): string {
  const minutes = Math.floor(Math.max(0,ms)/60_000);
  if (minutes < 1) return '<1 min';
  const hours = Math.floor(minutes/60);
  return hours ? `${hours}h ${minutes%60}m` : `${minutes}m`;
}

/** Track only focused, visible, recently interacted-with time. */
export function installUsageTracker(getBookId: () => string | null, isOnline: () => boolean): () => void {
  const IDLE_AFTER_MS = 180_000;
  let lastSample = Date.now();
  let lastActivity = Date.now();
  const tick = () => {
    const now = Date.now();
    const delta = now-lastSample;
    lastSample = now;
    if (delta<=0 || delta>30_000 || typeof document === 'undefined') return;
    if (document.visibilityState !== 'visible' || !document.hasFocus() || now-lastActivity>IDLE_AFTER_MS) return;
    recordUsage(delta,getBookId(),!isOnline(),new Date(now));
  };
  const interact = () => { tick(); lastActivity = Date.now(); };
  const interval = window.setInterval(tick,10_000);
  const listeners: Array<[EventTarget,string,EventListenerOrEventListenerObject,AddEventListenerOptions?]> = [
    [document,'pointerdown',interact],
    [document,'keydown',interact],
    [document,'wheel',interact,{ passive:true }],
    [document,'scroll',interact,{ capture:true,passive:true }],
    [document,'touchstart',interact,{ passive:true }],
    [window,'taiyou-reader-activity',interact],
    [window,'focus',interact],
    [window,'blur',tick],
    [window,'online',tick],
    [window,'offline',tick],
    [document,'visibilitychange',tick],
    [window,'pagehide',tick],
  ];
  for(const [target,name,handler,options] of listeners) target.addEventListener(name,handler,options);
  return () => {
    tick(); window.clearInterval(interval);
    for(const [target,name,handler,options] of listeners) target.removeEventListener(name,handler,options);
  };
}
