import { useEffect, useState } from 'react';
import { fetchCloudCover, type CloudSession } from '../lib/cloud';
import { cacheCover, getCachedCover } from '../lib/storage';
import type { LibraryBook } from '../types';

const objectUrls = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();

export function useCoverArt(book: LibraryBook, repo: string, session: CloudSession | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setUrl(null);
    if (!book.coverPath) return () => { active = false; };
    const key = book.id + ':' + book.coverPath;
    const task = inFlight.get(key) || (async () => {
      if (objectUrls.has(key)) return objectUrls.get(key)!;
      let cover = await getCachedCover(book.id).catch(() => null);
      if (!cover && repo && session && navigator.onLine) {
        cover = await fetchCloudCover(repo, book, session).catch(() => null);
        if (cover) await cacheCover(book.id, cover).catch(() => {});
      }
      if (!cover) return null;
      const address = URL.createObjectURL(cover);
      objectUrls.set(key, address);
      return address;
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, task);
    void task.then(value => { if (active) setUrl(value); });
    return () => { active = false; };
  }, [book.id, book.coverPath, repo, session?.via, session?.accessToken]);
  return url;
}
