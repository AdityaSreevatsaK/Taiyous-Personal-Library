import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearUsage, emptyUsage, localDayKey, readUsage, readableDuration,
  recordUsage, setUsageEnabled,
} from '../src/lib/usage-analytics';

const ID='01c88f7de0537852bbd350b1';
const OTHER='aaaaaaaaaaaaaaaaaaaaaaaa';
const DAY=new Date(2026,10,14,12,0,0);

describe('private, on-device activity counters', () => {
  let data:Map<string,string>;
  beforeEach(() => {
    data=new Map();
    vi.stubGlobal('localStorage', {
      getItem:(key:string)=>data.get(key)??null,
      setItem:(key:string,value:string)=>{data.set(key,value)},
      removeItem:(key:string)=>{data.delete(key)},
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('begins empty, enabled, and never requires a server', () => {
    expect(readUsage()).toEqual(emptyUsage());
    expect(readableDuration(0)).toBe('<1 min');
    expect(readableDuration(60_000)).toBe('1m');
    expect(readableDuration(3_900_000)).toBe('1h 5m');
  });

  it('distinguishes foreground app, reading and offline time without double counting', () => {
    const first=recordUsage(12_000,ID,true,DAY);
    expect(first.days['2026-11-14']).toEqual({appMs:12_000,readingMs:12_000,offlineMs:12_000});
    const second=recordUsage(8_000,null,true,DAY);
    expect(second.days['2026-11-14']).toEqual({appMs:20_000,readingMs:12_000,offlineMs:20_000});
    const third=recordUsage(5_000,OTHER,false,DAY);
    expect(third.days['2026-11-14']).toEqual({appMs:25_000,readingMs:17_000,offlineMs:20_000});
    expect(third.bookReadingMs[ID]).toBe(12_000);
    expect(third.bookReadingMs[OTHER]).toBe(5_000);
  });

  it('caps delayed timers, ignores bogus book identifiers and invalid deltas', () => {
    expect(recordUsage(10_000_000,'invalid',false,DAY).days['2026-11-14'].appMs).toBe(30_000);
    expect(readUsage().bookReadingMs).toEqual({});
    recordUsage(-20,ID,false,DAY);
    recordUsage(Number.NaN,ID,false,DAY);
    expect(readUsage().days['2026-11-14'].appMs).toBe(30_000);
  });

  it('retains local data when tracking is disabled and can erase only analytics', () => {
    recordUsage(5_000,ID,false,DAY);
    setUsageEnabled(false);
    recordUsage(5_000,ID,true,DAY);
    expect(readUsage().days['2026-11-14'].appMs).toBe(5_000);
    expect(readUsage().enabled).toBe(false);
    expect(clearUsage()).toEqual(emptyUsage(false));
    setUsageEnabled(true);
    expect(readUsage()).toEqual(emptyUsage(true));
  });

  it('safely ignores damaged or malicious data', () => {
    data.set('taiyou.usage-analytics.v1','{bad-json');
    expect(readUsage()).toEqual(emptyUsage());
    data.set('taiyou.usage-analytics.v1', JSON.stringify({
      version:1,enabled:false,days:{'2026-11-14':{appMs:-2,readingMs:'999',offlineMs:Infinity},fake:{appMs:12}},
      bookReadingMs:{[ID]:222,__proto__:550},
    }));
    expect(readUsage().enabled).toBe(false);
    expect(readUsage().days['2026-11-14']).toEqual({appMs:0,readingMs:0,offlineMs:0});
    expect(readUsage().bookReadingMs[ID]).toBe(222);
    expect(localDayKey(DAY)).toBe('2026-11-14');
  });

  it('never breaks app usage if browser storage is forbidden', () => {
    vi.stubGlobal('localStorage', {
      getItem:()=>{throw new Error('Storage disabled')},
      setItem:()=>{throw new Error('Storage disabled')},
    });
    expect(() => recordUsage(9_000,ID,false,DAY)).not.toThrow();
    expect(readUsage()).toEqual(emptyUsage());
  });
});
