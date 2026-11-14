import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Clock3, Download, Eraser, WifiOff, BookOpen, ShieldCheck } from 'lucide-react';
import type { LibraryBook } from '../types';
import { clearUsage, localDayKey, readUsage, readableDuration, setUsageEnabled } from '../lib/usage-analytics';
import './usage-analytics.css';

function exportAnalytics() {
  const data = readUsage();
  const blob = new Blob([JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `taiyou-reading-analytics-${localDayKey()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** On-device approximate engagement metrics; no Google Analytics or tracking API. */
export default function UsageDashboard({ books }: { books: LibraryBook[] }) {
  const [usage, setUsage] = useState(readUsage);
  useEffect(() => {
    const refresh = () => setUsage(readUsage());
    window.addEventListener('taiyou-usage-changed', refresh);
    const interval = setInterval(refresh, 30_000);
    return () => {
      window.removeEventListener('taiyou-usage-changed', refresh);
      clearInterval(interval);
    };
  }, []);
  const totals = useMemo(() => Object.values(usage.days).reduce((acc, day) => ({
    appMs: acc.appMs + day.appMs,
    readingMs: acc.readingMs + day.readingMs,
    offlineMs: acc.offlineMs + day.offlineMs,
  }), { appMs:0, readingMs:0, offlineMs:0 }), [usage]);
  const today = usage.days[localDayKey()] ?? { appMs:0, readingMs:0, offlineMs:0 };
  const days = useMemo(() => Array.from({length:14}, (_, index) => {
    const day = new Date();
    day.setHours(12,0,0,0);
    day.setDate(day.getDate() - (13-index));
    const key=localDayKey(day);
    return { key, date:day, ...(usage.days[key]??{appMs:0, readingMs:0, offlineMs:0}) };
  }), [usage]);
  const maxMs = Math.max(60_000,...days.map(day => day.appMs));
  const mostRead = Object.entries(usage.bookReadingMs).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const names = new Map(books.map(book=>[book.id,book.title]));
  const metrics = [
    { icon:Clock3, name:'Active app time', value:readableDuration(totals.appMs), note:'Foreground and non-idle' },
    { icon:BookOpen, name:'Reading time', value:readableDuration(totals.readingMs), note:'While a novel was open' },
    { icon:WifiOff, name:'Offline app time', value:readableDuration(totals.offlineMs), note:'While disconnected' },
    { icon:BarChart3, name:'Today', value:readableDuration(today.readingMs), note:'Estimated reading' },
  ] as const;

  return <section className="usage-dashboard" aria-label="Personal reading analytics">
    <header className="usage-header">
      <div><span className="section-overline">YOUR LIBRARY JOURNAL</span>
        <h1>Reading analytics</h1>
        <p>Find your reading rhythm. Timings are estimates of active use on <strong>this device only</strong>.</p>
      </div>
      <span className="usage-private"><ShieldCheck size={16}/> Private and on-device</span>
    </header>
    <div className="usage-metrics">
      {metrics.map(metric => <article className="usage-metric" key={metric.name}>
        <span className="usage-metric-icon"><metric.icon size={18}/>{metric.name}</span>
        <strong>{metric.value}</strong>
        <small>{metric.note}</small>
      </article>)}
    </div>
    <div className="usage-section-grid">
      <section className="usage-card" aria-label="Past 14 days of app and reading time">
        <div className="usage-card-head"><h2>Last 14 days</h2><span>App usage / reading</span></div>
        <div className="usage-chart" role="group" aria-label="Daily usage histogram">
          {days.map(day => <div className="usage-chart-day" key={day.key}
              title={`${day.key}: App ${readableDuration(day.appMs)}, reading ${readableDuration(day.readingMs)}, offline ${readableDuration(day.offlineMs)}`}>
            <div className="usage-chart-track" role="img" aria-label={`${day.key}: ${readableDuration(day.appMs)} app, ${readableDuration(day.readingMs)} reading`}>
              <div className="usage-chart-app" style={{height:`${Math.max(0,day.appMs/maxMs*100)}%`}}>
                <div className="usage-chart-reading" style={{height:`${day.appMs?day.readingMs/day.appMs*100:0}%`}}/>
              </div>
            </div><span>{day.date.toLocaleDateString(undefined,{weekday:'short'}).slice(0,2)}</span>
          </div>)}
        </div>
        <div className="usage-legend"><span><i className="usage-legend-app"/> Active app</span><span><i className="usage-legend-reading"/> Reading</span></div>
      </section>
      <section className="usage-card" aria-label="Time spent on individual novels">
        <div className="usage-card-head"><h2>Most read novels</h2><span>On this device</span></div>
        {mostRead.length ? <ol className="usage-book-list">
          {mostRead.map(([id,ms]) => <li key={id}><span>{names.get(id) || 'Novel no longer in library'}</span><strong>{readableDuration(ms)}</strong></li>)}
        </ol> : <p className="usage-empty">Your reading statistics will appear as you use the EPUB reader.</p>}
      </section>
    </div>
    <section className="usage-privacy" aria-label="Analytics controls">
      <div><h2>Privacy and controls</h2>
        <p>Time is counted only while the tab is visible, focused and recently used. Reading inside EPUBs counts towards reading time; offline time overlaps with app time. No third-party analytics, cloud uploads or device tracking.</p>
        <p>Existing reading history cannot be reconstructed, so tracking starts from this release. Clearing browser data also clears these statistics.</p>
        <label className="usage-privacy-toggle"><input type="checkbox" checked={usage.enabled}
          onChange={event => setUsage(setUsageEnabled(event.target.checked))}/> Record analytics on this device</label>
      </div>
      <div className="usage-privacy-actions">
        <button type="button" onClick={exportAnalytics}><Download size={15}/> Export JSON</button>
        <button type="button" onClick={() => {
          if (window.confirm('Permanently delete all usage analytics on this device? Your novels and reading progress will remain untouched.')) {
            setUsage(clearUsage());
          }
        }}><Eraser size={15}/> Clear analytics</button>
      </div>
    </section>
  </section>;
}
