import { useEffect, useState } from 'react';
import { fetchCloudCover, type CloudSession } from '../lib/cloud';
import { cacheCover, getCachedCover } from '../lib/storage';
import { createRequestLimiter } from '../lib/network-pool';
import type { LibraryBook } from '../types';

// Share pending cover downloads, not object URLs. Object URLs pin decoded images
// in browser memory and must be released when the last rendering component exits.
const inFlight = new Map<string, Promise<Blob | null>>();
// IntersectionObserver stops off-screen starts, but a fast scroll or several
// galleries can still mount dozens of covers at once. Keep remote private
// gateway fetches bounded; cache hits do not wait for a network slot.
const downloadCover = createRequestLimiter(4);

export function useCoverArt(book: LibraryBook, repo: string, session: CloudSession | null, enabled = true): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  useEffect(() => {
    const reconnect = () => setConnectionEpoch(value => value + 1);
    window.addEventListener('online', reconnect);
    return () => window.removeEventListener('online', reconnect);
  }, []);
  useEffect(() => {
    let active = true;
    let ownedUrl: string | null = null;
    setUrl(null);
    if (!book.coverPath || !enabled) return () => { active = false; };
    const connection = !session ? 'anonymous' : session.via === 'oauth' ? 'oauth' : 'token';
    const key = [book.id, book.coverPath, repo, connection].join(':');
    let task = inFlight.get(key);
    if (!task) {
      task = (async () => {
        let cover = await getCachedCover(book.id).catch(() => null);
        if (!cover && repo && session && navigator.onLine) {
          cover = await downloadCover(() => fetchCloudCover(repo, book, session)).catch(() => null);
          if (cover) await cacheCover(book.id, cover).catch(() => {});
        }
        return cover;
      })().finally(() => { inFlight.delete(key); });
      inFlight.set(key, task);
    }
    void task.then(cover => {
      if (!active || !cover) return;
      ownedUrl = URL.createObjectURL(cover);
      setUrl(ownedUrl);
    }).catch(() => {
      // Keep a neutral unavailable-cover indicator, never invented jacket art.
    });
    return () => {
      active = false;
      if (ownedUrl) URL.revokeObjectURL(ownedUrl);
    };
  }, [book.id, book.coverPath, repo, session?.via, session?.accessToken, enabled, connectionEpoch]);
  return url;
}
