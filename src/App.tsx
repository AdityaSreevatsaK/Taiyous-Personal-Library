import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import LibraryDashboard from './components/LibraryDashboard';
import BookDetails from './components/BookDetails';
import Reader from './components/Reader';
import { extractEpubMetadata, prepareImport } from './lib/importer';
import { normalizeTags } from './lib/tags';
import { deleteBook, getBookFile, getBooks, getCachedEpubIds, readSettings, saveBook, updateBook, writeSettings } from './lib/storage';
import {
  blendCloudAndLocal, clearCloudSession, createCloudSession, discoverHostedOAuthSession, assertPrivateDataset,
  fetchCloudCatalog, fetchCloudEpub, fetchCloudArchive, fetchCloudPersonalReview, findCloudEntryForBook, readDatasetRepo, saveDatasetRepo,
  saveCloudPersonalReview, fetchCloudReadingProgress, saveCloudReadingProgress, applyCloudReadingProgress,
  uploadNovelToCloud, validateDatasetRepo,
  type CloudEntry, type CloudSession,
} from './lib/cloud';
import type { LibraryBook, ReaderSettings } from './types';
import { fetchCloudCollections, mergeCollections, readLocalCollections, saveCloudCollections, writeLocalCollections, readCollectionsPending, writeCollectionsPending, type BookCollection } from './lib/collections';

export default function App() {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [settings, setSettings] = useState<ReaderSettings>(readSettings);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [startChapterHref, setStartChapterHref] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [browseTag, setBrowseTag] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');
  const [collections, setCollections] = useState<BookCollection[]>(readLocalCollections);
  const [collectionsSyncPending, setCollectionsSyncPending] = useState(readCollectionsPending);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [cloudSession, setCloudSession] = useState<CloudSession | null>(null);
  const [cloudRepo, setCloudRepo] = useState(readDatasetRepo);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const [loadingBook, setLoadingBook] = useState<string | null>(null);
  const [cachedEpubIds, setCachedEpubIds] = useState<string[]>([]);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [offlineShellReady, setOfflineShellReady] = useState(false);
  const [cachingId, setCachingId] = useState<string | null>(null);
  const [bulkOfflineProgress, setBulkOfflineProgress] = useState<{ done: number; total: number } | null>(null);
  const filePicker = useRef<HTMLInputElement | null>(null);
  const booksRef = useRef<LibraryBook[]>([]);
  const collectionsRef = useRef<BookCollection[]>(collections);
  const cloudEntries = useRef<Map<string, CloudEntry>>(new Map());
  const busyRef = useRef(false);
  const syncRef = useRef(false);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const loginError = parameters.get('oauth_error');
    if (!loginError) return;
    const explanations: Record<string, string> = {
      invalid_callback: 'Hugging Face login expired or was interrupted. Please try again.',
      exchange_failed: 'Hugging Face could not complete login. Try signing in again.',
      insufficient_scope: 'The Hugging Face authorisation must include read and write repository access.',
      wrong_account: 'Please sign in with the Hugging Face account that owns Taiyous-Novels.',
      dataset_access: 'The signed-in Hugging Face account cannot access the private novel dataset.',
      login_failed: 'Hugging Face login failed. Please try again.',
    };
    setCloudMessage(explanations[loginError] || 'Unable to connect with Hugging Face.');
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);
  }, []);

  useEffect(() => { booksRef.current = books; }, [books]);
  useEffect(() => { writeSettings(settings); }, [settings]);
  useEffect(() => {
    // Remove a short-lived OAuth session previously stored by older builds.
    clearCloudSession();
    let active = true;
    getBooks().then(saved => {
      if (!active) return;
      booksRef.current = saved;
      setBooks(saved);
      void getCachedEpubIds().then(setCachedEpubIds).catch(() => undefined);
    }).catch(() => {
      if (active) setStorageError('This browser cannot open your local library. Enable IndexedDB or use a normal browsing window.');
    });
    return () => { active = false; };
  }, []);

  // After Hugging Face OAuth signs the reader in on the production Cloudflare
  // hostname, discover the private dataset session automatically.
  // No Hugging Face token is ever copied to browser state or local storage.
  useEffect(() => {
    let active = true;
    const connect = async () => {
      const detected = await discoverHostedOAuthSession();
      if (!active || !detected) return;
      try { saveDatasetRepo(detected.repo); } catch { /* localStorage may be unavailable */ }
      setCloudRepo(detected.repo);
      setCloudSession(detected.session);
      setCloudMessage('Private dataset connected through your Hugging Face login.');
    };
    void connect();
    const onReconnect = () => { void connect(); };
    window.addEventListener('online', onReconnect);
    return () => { active = false; window.removeEventListener('online', onReconnect); };
  }, []);

  useEffect(() => {
    let active = true;
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    const checkShell = () => {
      // A controller alone does not prove offline startup will work: verify
      // that the HTML and the compiled entry assets are actually cached.
      void (async () => {
        if (!navigator.serviceWorker?.controller || !('caches' in window)) {
          if (active) setOfflineShellReady(false);
          return;
        }
        try {
          const root = new URL('./', document.baseURI).href;
          const html = new URL('index.html', document.baseURI).href;
          const shell = await caches.match(root) || await caches.match(html);
          const scripts = [...document.querySelectorAll('script[src]')].map(el => (el as HTMLScriptElement).src);
          const styles = [...document.querySelectorAll('link[rel="stylesheet"]')].map(el => (el as HTMLLinkElement).href);
          const assets = [...scripts, ...styles].filter(url => url.startsWith(location.origin + '/'));
          const assetHits = await Promise.all(assets.map(url => caches.match(url)));
          if (active) setOfflineShellReady(Boolean(shell) && assetHits.every(Boolean));
        } catch {
          if (active) setOfflineShellReady(false);
        }
      })();
    };
    window.addEventListener('taiyou-offline-shell-updated', checkShell);
    navigator.serviceWorker?.addEventListener('controllerchange', checkShell);
    checkShell();
    return () => {
      active = false;
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      window.removeEventListener('taiyou-offline-shell-updated', checkShell);
      navigator.serviceWorker?.removeEventListener('controllerchange', checkShell);
    };
  }, []);

  const refreshCloud = useCallback(async (repo = cloudRepo, session = cloudSession) => {
    if (!repo || !session || syncRef.current) return;
    syncRef.current = true;
    setCloudBusy(true);
    setCloudMessage(null);
    try {
      const catalog = await fetchCloudCatalog(validateDatasetRepo(repo), session);
      cloudEntries.current = new Map(catalog.books.map(entry => [entry.id, entry]));
      // Reload saved metadata first so progress from this browser is preserved.
      const local = await getBooks();
      const merged = blendCloudAndLocal(catalog.books, local);
      // Read personal annotations separately. A missing per-book file (404) is
      // normal for unreviewed novels. Never use the shared novel catalogue for
      // personal comments, and never erase local notes on a transient error.
      let notesWarning = false;
      const synced = await Promise.all(merged.map(async book => {
        const entry = findCloudEntryForBook(catalog.books, book);
        if (!entry) return book;
        try {
          const note = await fetchCloudPersonalReview(repo, entry.id, session);
          const localTimestamp = book.personalReviewUpdatedAt ?? 0;
          // Offline edits are replayed only after reconnecting to an authorised
          // dataset. A newer remote edit wins rather than being overwritten.
          if (book.pendingReviewSync && localTimestamp > (note?.updatedAt ?? -1)) {
            await saveCloudPersonalReview(repo, entry.id, session, book.personalRating, book.personalReview || '', localTimestamp);
            return { ...book, pendingReviewSync: false };
          }
          if (!note) return book;
          if (note.updatedAt < localTimestamp) return book;
          return { ...book, personalRating: note.rating ?? undefined,
            personalReview: note.comments, personalReviewUpdatedAt: note.updatedAt, pendingReviewSync: false };
        } catch {
          notesWarning = true;
          return book;
        }
      }));
      let progressWarning = false;
      const withProgress = await Promise.all(synced.map(async book => {
        const entry = findCloudEntryForBook(catalog.books, book);
        if (!entry) return book;
        try {
          const remote = await fetchCloudReadingProgress(repo, entry.id, session);
          const localTimestamp = book.progressUpdatedAt ?? book.lastOpenedAt ?? 0;
          if (remote && remote.updatedAt >= localTimestamp) {
            return applyCloudReadingProgress(book, remote);
          }
          if (book.pendingProgressSync || book.progress > 0) {
            const uploading = { ...book, progressUpdatedAt: Math.max(localTimestamp, Date.now()) };
            await saveCloudReadingProgress(repo, entry.id, session, uploading);
            return { ...uploading, pendingProgressSync: false };
          }
        } catch {
          progressWarning = true;
        }
        return book;
      }));
      booksRef.current = withProgress;
      setBooks(withProgress);
      await Promise.all(withProgress.filter(book => book.cloud).map(book => updateBook(book)));
      // Separate private collections data is merged by record timestamp;
      // offline edits are retained, and newer local edits are published on reconnection.
      let collectionsWarning = false;
      try {
        const localCollections = collectionsRef.current;
        const hostedCollections = await fetchCloudCollections(repo, session);
        const allCollections = mergeCollections(hostedCollections, localCollections);
        const needsPublish = allCollections.some(item => {
          const remote = hostedCollections.find(other => other.id === item.id);
          return !remote || item.updatedAt > remote.updatedAt;
        });
        const finalCollections = needsPublish
          ? await saveCloudCollections(repo, session, allCollections)
          : allCollections;
        collectionsRef.current = finalCollections;
        writeLocalCollections(finalCollections);
        setCollections(finalCollections);
        writeCollectionsPending(false);
        setCollectionsSyncPending(false);
      } catch {
        collectionsWarning = true;
        writeCollectionsPending(true);
        setCollectionsSyncPending(true);
      }
      setCloudMessage(`${catalog.books.length} hosted ${catalog.books.length === 1 ? 'novel' : 'novels'} available on this device.${notesWarning ? ' Some personal notes could not be synced.' : ''}${progressWarning ? ' Some reading progress could not be synced.' : ''}${collectionsWarning ? ' Collections sync needs a retry.' : ''}`);
    } catch (reason) {
      setCloudMessage(`Cloud library unavailable: ${reason instanceof Error ? reason.message : String(reason)}`);
    } finally {
      setCloudBusy(false);
      syncRef.current = false;
    }
  }, [cloudRepo, cloudSession]);

  useEffect(() => { if (cloudRepo && cloudSession) void refreshCloud(); }, [cloudRepo, cloudSession, refreshCloud]);
  // Once a token is re-entered, reconnect will also replay offline note edits.
  // While the tab remains open, a browser online event retries automatically.
  useEffect(() => {
    if (!cloudRepo || !cloudSession) return;
    const onReconnect = () => { void refreshCloud(cloudRepo, cloudSession); };
    window.addEventListener('online', onReconnect);
    return () => window.removeEventListener('online', onReconnect);
  }, [cloudRepo, cloudSession, refreshCloud]);


  // Persist in-reader progress periodically, avoiding one dataset commit per scroll.
  // Pending metadata stays in IndexedDB and survives offline sessions.
  useEffect(() => {
    if (!cloudRepo || !cloudSession) return;
    let busy = false;
    const sync = async () => {
      if (busy || syncRef.current || !navigator.onLine) return;
      busy = true;
      try {
        for (const snapshot of booksRef.current.filter(book => book.cloud && book.pendingProgressSync)) {
          const entry = findCloudEntryForBook([...cloudEntries.current.values()], snapshot);
          if (!entry) continue;
          try {
            const remote = await fetchCloudReadingProgress(cloudRepo, entry.id, cloudSession);
            const current = booksRef.current.find(book => book.id === snapshot.id);
            if (!current?.pendingProgressSync) continue;
            const localTimestamp = current.progressUpdatedAt ?? 0;
            let updated: LibraryBook;
            if (remote && remote.updatedAt >= localTimestamp) {
              updated = applyCloudReadingProgress(current, remote);
            } else {
              await saveCloudReadingProgress(cloudRepo, entry.id, cloudSession, current);
              updated = { ...current, pendingProgressSync: false };
            }
            // A new scroll may have occurred during upload; never clear newer edits.
            const latest = booksRef.current.find(book => book.id === snapshot.id);
            if (latest && latest.progressUpdatedAt === localTimestamp) {
              booksRef.current = booksRef.current.map(book => book.id === latest.id ? updated : book);
              setBooks(booksRef.current);
              await updateBook(updated);
            }
          } catch {
            // Leave the pending flag set for a later authorised retry.
          }
        }
      } finally { busy = false; }
    };
    const timer = window.setInterval(() => { void sync(); }, 60000);
    window.addEventListener('online', sync);
    return () => { window.clearInterval(timer); window.removeEventListener('online', sync); };
  }, [cloudRepo, cloudSession]);

  const saveCloudRepository = useCallback((value: string) => {
    try {
      const repo = validateDatasetRepo(value);
      saveDatasetRepo(repo);
      setCloudRepo(repo);
      cloudEntries.current.clear();
      setCloudMessage(`Dataset ${repo} configured. Connect with your dataset-scoped token to load hosted novels.`);
    } catch (reason) { setCloudMessage(String(reason)); }
  }, []);

  const signInToCloud = useCallback((token: string) => {
    if (!cloudRepo) {
      setCloudMessage('Save your private dataset repository ID before connecting.');
      return;
    }
    let candidate: CloudSession;
    try { candidate = createCloudSession(cloudRepo, token); }
    catch (reason) { setCloudMessage(reason instanceof Error ? reason.message : String(reason)); return; }
    setCloudBusy(true);
    setCloudMessage('Checking access to the private novel dataset…');
    void assertPrivateDataset(cloudRepo, candidate).then(() => {
      // Only keep the token in component memory for this page session.
      setCloudSession(candidate);
      setCloudMessage('Connected to your private dataset. The access token is not saved; reload to disconnect.');
    }).catch(reason => {
      setCloudSession(null);
      setCloudMessage(`Could not connect: ${reason instanceof Error ? reason.message : String(reason)}. Check token permissions for this dataset.`);
    }).finally(() => setCloudBusy(false));
  }, [cloudRepo]);
  const signOutOfCloud = useCallback(() => {
    if (cloudSession?.via === 'oauth') {
      void fetch('/api/oauth/logout', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'X-Taiyou-Request': 'logout' },
      }).then(response => {
        if (!response.ok) throw new Error('Could not sign out');
        setCloudSession(null);
        setCloudMessage('Signed out of Hugging Face. Offline EPUBs are still available.');
      }).catch(() => setCloudMessage('Unable to sign out. Please try again.'));
      return;
    }
    clearCloudSession();
    setCloudSession(null);
    setCloudMessage('Disconnected. Your cached EPUBs remain in this browser.');
  }, [cloudSession]);

  const importFiles = useCallback(async (files: FileList | File[]) => {
    if (busyRef.current) return;
    const selected = Array.from(files);
    if (!selected.length) return;
    busyRef.current = true;
    setImporting(true);
    setError(null);
    setNotice(null);
    let added = 0;
    let duplicate = 0;
    let published = 0;
    const failures: string[] = [];
    try {
      const existing = new Set(booksRef.current.map(book => book.id));
      for (const file of selected) {
        try {
          const imported = await prepareImport(file);
          const { metadata, epub } = imported;
          const alreadyLocal = existing.has(metadata.id);
          if (!alreadyLocal) {
            await saveBook(metadata, epub);
            existing.add(metadata.id);
            added++;
          } else duplicate++;
          if (cloudRepo && cloudSession) {
            // Cloud is the same private data folder regardless of which device
            // initiated the upload. A ZIP archive and extracted EPUB both go in.
            try {
              const result = await uploadNovelToCloud(cloudRepo, cloudSession, file, imported);
              if (result === 'added') published++;
              const current = booksRef.current.find(book => book.id === metadata.id) || metadata;
              await updateBook({ ...current, cloud: true });
            } catch (reason) {
              failures.push(`${file.name}: saved on this device, but CLOUD UPLOAD FAILED: ${String(reason)}`);
            }
          }
        } catch (reason) {
          failures.push(`${file.name}: ${reason instanceof Error ? reason.message : String(reason)}`);
        }
      }
      const latest = await getBooks();
      booksRef.current = latest;
      setBooks(latest);
      void getCachedEpubIds().then(setCachedEpubIds).catch(() => undefined);
      if (added || duplicate || published) {
        const localText = `${added} newly imported, ${duplicate} already on this device.`;
        const remoteText = cloudRepo && cloudSession
          ? ` ${published} uploaded to the private cloud library.`
          : ' Local import only. Connect Hugging Face Cloud to publish novels for your other devices.';
        setNotice(localText + remoteText);
      }
      if (failures.length) setError(failures.slice(0, 3).join(' | ') + (failures.length > 3 ? ` (+${failures.length - 3} more)` : ''));
      if (cloudRepo && cloudSession && (published || duplicate)) await refreshCloud(cloudRepo, cloudSession);
    } catch (reason) { setError(`Unable to save novels: ${String(reason)}`); }
    finally {
      setImporting(false);
      busyRef.current = false;
    }
  }, [cloudRepo, cloudSession, refreshCloud]);

  const publishCachedNovels = useCallback(() => {
    if (!cloudRepo || !cloudSession) {
      setCloudMessage('Configure a private dataset and connect before publishing.');
      return;
    }
    if (busyRef.current || syncRef.current) return;
    void (async () => {
      busyRef.current = true;
      setCloudBusy(true);
      let published = 0;
      const failures: string[] = [];
      try {
        // v0.7.0 cached only extracted EPUBs, not the original ZIP bytes.
        // This action publishes those EPUBs; re-select ZIPs separately to
        // preserve each original ZIP in the cloud dataset.
        for (const book of booksRef.current.filter(item => !item.cloud)) {
          try {
            const epub = await getBookFile(book.id);
            const file = new File([epub], `${book.id}.epub`, { type: 'application/epub+zip' });
            await uploadNovelToCloud(cloudRepo, cloudSession, file, { metadata: book, epub });
            await updateBook({ ...book, cloud: true });
            published++;
          } catch (reason) { failures.push(`${book.title}: ${String(reason)}`); }
        }
        await refreshCloud(cloudRepo, cloudSession);
        setCloudMessage(`${published} cached novel(s) published as EPUB. ${failures.length ? `${failures.length} failed: ${failures.slice(0, 2).join(' | ')}` : 'Original ZIP archives must be re-selected if you want them backed up too.'}`);
      } finally {
        busyRef.current = false;
        setCloudBusy(false);
      }
    })();
  }, [cloudRepo, cloudSession, refreshCloud]);

  const ensureCached = useCallback(async (book: LibraryBook) => {
    try { await getBookFile(book.id); return; }
    catch { /* this novel may exist only in the hosted dataset */ }
    if (!cloudRepo || !cloudSession) throw new Error('Connect your private dataset to download this hosted EPUB.');
    // The in-memory entry map can be stale after reconnection or an older local
    // import may have a different EPUB hash from the hosted copy.
    let entry = findCloudEntryForBook([...cloudEntries.current.values()], book);
    if (!entry) {
      const catalog = await fetchCloudCatalog(validateDatasetRepo(cloudRepo), cloudSession);
      cloudEntries.current = new Map(catalog.books.map(item => [item.id, item]));
      entry = findCloudEntryForBook(catalog.books, book);
    }
    if (!entry) {
      throw new Error(`No matching hosted EPUB was found for "${book.title}" after refreshing the private catalogue. Check the catalogue and original files; do not re-upload or delete anything yet.`);
    }
    const file = await fetchCloudEpub(cloudRepo, entry, cloudSession);
    const current = booksRef.current.find(item => item.id === book.id) || book;
    await saveBook(current, file);
    setCachedEpubIds(ids => ids.includes(book.id) ? ids : [...ids, book.id]);
  }, [cloudRepo, cloudSession]);

  const makeAvailableOffline = useCallback(async (book: LibraryBook) => {
    setCachingId(book.id);
    setError(null);
    try {
      if (!online && !cachedEpubIds.includes(book.id)) throw new Error('Connect to the internet and the private novel dataset to cache this EPUB.');
      await ensureCached(book);
      setCachedEpubIds(ids => ids.includes(book.id) ? ids : [...ids, book.id]);
      // Request more durable browser storage when the user explicitly downloads.
      if (navigator.storage?.persist) void navigator.storage.persist().catch(() => undefined);
      setNotice(`"${book.title}" is available offline on this device. You may also export its EPUB from Novel Details.`);
    } catch (reason) {
      setError(`Unable to prepare offline EPUB: ${String(reason)}`);
    } finally { setCachingId(null); }
  }, [online, cachedEpubIds, ensureCached]);

  const saveAllOffline = useCallback(async () => {
    if (!navigator.onLine) {
      setError('Connect to the internet to save uncached novels for offline use.');
      return;
    }
    if (bulkOfflineProgress) return;
    setError(null);
    setNotice(null);
    const locallyAvailable = new Set(await getCachedEpubIds());
    const needed = booksRef.current.filter(book => !locallyAvailable.has(book.id));
    if (!needed.length) {
      setNotice('Every novel is already available offline on this device.');
      return;
    }
    setBulkOfflineProgress({ done: 0, total: needed.length });
    const failures: string[] = [];
    let done = 0;
    try {
      // Keep concurrent downloads low so large EPUBs do not exhaust browser memory.
      for (const book of needed) {
        if (!navigator.onLine) {
          failures.push('Connection lost. Unfinished novels remain available for retry.');
          break;
        }
        try {
          await ensureCached(book);
          setCachedEpubIds(ids => ids.includes(book.id) ? ids : [...ids, book.id]);
        } catch (reason) {
          failures.push(`${book.title}: ${String(reason)}`);
        }
        done++;
        setBulkOfflineProgress({ done, total: needed.length });
      }
      if (navigator.storage?.persist) void navigator.storage.persist().catch(() => undefined);
      const successful = done - failures.filter(x => x.includes(': ')).length;
      setNotice(`${successful} of ${needed.length} novels saved for offline reading.`);
      if (failures.length) setError(`Some downloads could not finish: ${failures.slice(0, 3).join(' | ')}`);
    } finally {
      setBulkOfflineProgress(null);
    }
  }, [bulkOfflineProgress, ensureCached]);

  const showDetails = useCallback((book: LibraryBook) => {
    setError(null);
    setNotice(null);
    setLoadingBook(book.title);
    void (async () => {
      try {
        await ensureCached(book);
        setDetailsId(book.id);
        setReadingId(null);
        if (!book.metadataScanned) {
          const file = await getBookFile(book.id);
          const parsed = await extractEpubMetadata(file);
          const current = booksRef.current.find(item => item.id === book.id);
          if (current && !current.metadataScanned) {
            const updated: LibraryBook = { ...current,
              description: current.description || parsed.description,
              sourceTags: current.sourceTags?.length ? current.sourceTags : parsed.sourceTags,
              sourceUrl: current.sourceUrl || parsed.sourceUrl,
              status: current.status || parsed.status,
              chapterCount: current.chapterCount || parsed.chapterCount,
              metadataScanned: true,
            };
            await updateBook(updated);
            booksRef.current = booksRef.current.map(item => item.id === book.id ? updated : item);
            setBooks(booksRef.current);
          }
        }
      } catch (reason) { setError(`Unable to open novel: ${String(reason)}`); }
      finally { setLoadingBook(null); }
    })();
  }, [ensureCached]);

  const savePersonalTags = useCallback(async (bookId: string, tags: string[]) => {
    const current = booksRef.current.find(book => book.id === bookId);
    if (!current) return;
    const updated = { ...current, personalTags: normalizeTags(tags) };
    await updateBook(updated);
    booksRef.current = booksRef.current.map(book => book.id === bookId ? updated : book);
    setBooks(booksRef.current);
  }, []);

  const savePersonalSummary = useCallback(async (bookId: string, summary: string) => {
    const current = booksRef.current.find(book => book.id === bookId);
    if (!current) return;
    const updated = { ...current, userDescription: summary.trim().slice(0, 24000) };
    await updateBook(updated);
    booksRef.current = booksRef.current.map(book => book.id === bookId ? updated : book);
    setBooks(booksRef.current);
  }, []);

  const savePersonalReview = useCallback(async (bookId: string, rating: number | undefined, review: string) => {
    const current = booksRef.current.find(book => book.id === bookId);
    if (!current) throw new Error('Novel not found in local library');
    if (rating !== undefined && (!Number.isInteger(rating) || rating < 1 || rating > 10)) {
      throw new Error('Rating must be between 1 and 10');
    }
    const updatedAt = Date.now();
    const updated = { ...current, personalRating: rating, personalReview: review.trim().slice(0, 10000),
      personalReviewUpdatedAt: updatedAt, pendingReviewSync: !!current.cloud };
    await updateBook(updated);
    booksRef.current = booksRef.current.map(book => book.id === bookId ? updated : book);
    setBooks(booksRef.current);
    if (cloudRepo && cloudSession && current.cloud) {
      const known = [...cloudEntries.current.values()];
      let entry = findCloudEntryForBook(known, current);
      if (!entry) {
        const catalog = await fetchCloudCatalog(cloudRepo, cloudSession);
        cloudEntries.current = new Map(catalog.books.map(item => [item.id, item]));
        entry = findCloudEntryForBook(catalog.books, current);
      }
      if (!entry) throw new Error('Saved locally, but the hosted novel could not be matched. Cloud sync did not complete.');
      try {
        await saveCloudPersonalReview(cloudRepo, entry.id, cloudSession, rating, updated.personalReview, updatedAt);
        const latest = booksRef.current.find(item => item.id === bookId);
        if (latest && latest.personalReviewUpdatedAt === updatedAt) {
          const synced = { ...latest, pendingReviewSync: false };
          await updateBook(synced);
          booksRef.current = booksRef.current.map(item => item.id === bookId ? synced : item);
          setBooks(booksRef.current);
        }
      } catch (error) {
        throw new Error(`Saved on this device, but cloud synchronisation failed: ${String(error)}`);
      }
    }
  }, [cloudRepo, cloudSession]);

  const downloadFile = useCallback((blob: Blob, title: string, extension: 'epub' | 'zip') => {
    const safeName = (title.replace(/[^\p{L}\p{N} ._()-]/gu, '_').trim() || 'novel').slice(0, 100);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeName}.${extension}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }, []);

  const downloadEpub = useCallback(async (book: LibraryBook) => {
    setError(null);
    setLoadingBook(`Preparing ${book.title} download`);
    try {
      await ensureCached(book);
      downloadFile(await getBookFile(book.id), book.title, 'epub');
    } catch (error) {
      setError(`Unable to download EPUB: ${String(error)}`);
      throw error;
    } finally { setLoadingBook(null); }
  }, [ensureCached, downloadFile]);

  const downloadArchive = useCallback(async (book: LibraryBook) => {
    if (!cloudRepo || !cloudSession) throw new Error('Connect your private dataset to download its original ZIP.');
    let entry = findCloudEntryForBook([...cloudEntries.current.values()], book);
    if (!entry) {
      const catalog = await fetchCloudCatalog(cloudRepo, cloudSession);
      entry = findCloudEntryForBook(catalog.books, book);
    }
    if (!entry?.archivePath) throw new Error('This novel has no hosted original ZIP.');
    downloadFile(await fetchCloudArchive(cloudRepo, entry, cloudSession), book.title, 'zip');
  }, [cloudRepo, cloudSession, downloadFile]);

  // Optimistically save collection edits locally, then publish a separately
  // versioned private collection list. EPUB files and data/library.json are not touched.
  const changeCollections = useCallback(async (edit: (current: BookCollection[]) => BookCollection[]) => {
    const next = edit(collectionsRef.current);
    collectionsRef.current = next;
    writeLocalCollections(next);
    setCollections(next);
    writeCollectionsPending(true);
    setCollectionsSyncPending(true);
    if (cloudRepo && cloudSession) {
      try {
        const synced = await saveCloudCollections(cloudRepo, cloudSession, next);
        const combined = mergeCollections(synced, collectionsRef.current);
        collectionsRef.current = combined;
        writeLocalCollections(combined);
        setCollections(combined);
        // If another edit happened during this upload, retain its pending flag.
        if (collectionsRef.current.every(c => {
          const syncedEntry = synced.find(s => s.id === c.id);
          return syncedEntry && syncedEntry.updatedAt >= c.updatedAt;
        })) {
          writeCollectionsPending(false);
          setCollectionsSyncPending(false);
        }
      } catch (cause) {
        setError(`Collections saved on this device, but cloud sync failed: ${String(cause)}`);
      }
    }
  }, [cloudRepo, cloudSession]);

  const createCollection = useCallback(async (name: string) => {
    const cleaned = name.trim().slice(0, 90);
    if (!cleaned) return;
    await changeCollections(current => {
      if (current.some(c => !c.deleted && c.name.toLocaleLowerCase() === cleaned.toLocaleLowerCase())) return current;
      return [...current, { id: crypto.randomUUID(), name: cleaned, bookIds: [], updatedAt: Date.now() }];
    });
  }, [changeCollections]);

  const changeCollectionMembership = useCallback(async (collectionId: string, bookId: string, include: boolean) => {
    await changeCollections(current => current.map(c => {
      if (c.id !== collectionId || c.deleted) return c;
      const ids = new Set(c.bookIds);
      if (include) ids.add(bookId); else ids.delete(bookId);
      return { ...c, bookIds: [...ids], updatedAt: Math.max(Date.now(), c.updatedAt + 1) };
    }));
  }, [changeCollections]);

  const renameCollection = useCallback(async (collectionId: string, name: string) => {
    const cleaned = name.trim().slice(0, 90);
    if (!cleaned) return;
    await changeCollections(current => current.map(c => c.id === collectionId && !c.deleted
      ? { ...c, name: cleaned, updatedAt: Math.max(Date.now(), c.updatedAt + 1) } : c));
  }, [changeCollections]);

  const deleteCollection = useCallback(async (collectionId: string) => {
    await changeCollections(current => current.map(c => c.id === collectionId
      ? { ...c, deleted: true, updatedAt: Math.max(Date.now(), c.updatedAt + 1) } : c));
  }, [changeCollections]);

  const openBook = useCallback((book: LibraryBook, chapterHref?: string) => {
    setLoadingBook(book.title);
    void (async () => {
      try {
        await ensureCached(book);
        const current = booksRef.current.find(item => item.id === book.id) || book;
        const updated = { ...current, lastOpenedAt: Date.now() };
        booksRef.current = booksRef.current.map(item => item.id === book.id ? updated : item);
        setBooks(booksRef.current);
        setStartChapterHref(chapterHref || null);
        await updateBook(updated);
        setDetailsId(book.id);
        setReadingId(book.id);
        setError(null);
        setNotice(null);
      } catch (reason) { setError(`Unable to open novel: ${String(reason)}`); }
      finally { setLoadingBook(null); }
    })();
  }, [ensureCached]);

  const recordProgress = useCallback((patch: Partial<LibraryBook>) => {
    if (!readingId) return;
    const current = booksRef.current.find(item => item.id === readingId);
    if (!current) return;
    const updated = { ...current, ...patch,
      ...(current.cloud ? { progressUpdatedAt: Date.now(), pendingProgressSync: true } : {}) };
    booksRef.current = booksRef.current.map(book => book.id === readingId ? updated : book);
    setBooks(booksRef.current);
    void updateBook(updated).catch(() => setStorageError('Reading progress could not be saved. Check available browser storage.'));
  }, [readingId]);

  const removeBook = useCallback(async (book: LibraryBook) => {
    if (book.cloud) {
      setError('This novel is hosted in your private Hugging Face dataset. Delete it there if needed; the web app cannot delete hosted novels in this version.');
      return;
    }
    if (!window.confirm(`Remove “${book.title}” from this browser? This also removes its saved reading position.`)) return;
    try {
      await deleteBook(book.id);
      const current = booksRef.current.filter(item => item.id !== book.id);
      booksRef.current = current;
      setBooks(current);
      setCachedEpubIds(ids => ids.filter(id => id !== book.id));
      if (detailsId === book.id) setDetailsId(null);
      setNotice('Local novel removed from this device.');
      setError(null);
    } catch (reason) { setError(`Unable to remove novel: ${String(reason)}`); }
  }, [detailsId]);

  function pickerChanged(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) void importFiles(event.target.files);
    event.target.value = '';
  }
  const activeBook = books.find(book => book.id === readingId);
  const detailBook = books.find(book => book.id === detailsId);
  return <>
    {activeBook ? (
      <Reader key={activeBook.id} book={activeBook} settings={settings} onSettings={setSettings}
        initialChapterHref={startChapterHref || undefined}
        onBack={() => { setReadingId(null); setDetailsId(null); setStartChapterHref(null); }}
        onNovelDetails={() => { setReadingId(null); setDetailsId(activeBook.id); setStartChapterHref(null); }} onProgress={recordProgress} />
    ) : detailBook ? (
      <BookDetails book={detailBook} theme={settings.theme}
        onBack={() => setDetailsId(null)} onRead={() => openBook(detailBook)}
        onReadChapter={href => openBook(detailBook, href)}
        onDownloadEpub={() => downloadEpub(detailBook)}
        onDownloadArchive={cloudSession && findCloudEntryForBook([...cloudEntries.current.values()], detailBook)?.archivePath
          ? () => downloadArchive(detailBook) : undefined}
        cloudConnected={!!cloudSession && !!cloudRepo}
        cloudRepo={cloudRepo} cloudSession={cloudSession}
        onSaveTags={tags => savePersonalTags(detailBook.id, tags)}
        onSaveSummary={summary => savePersonalSummary(detailBook.id, summary)}
        onSaveReview={(rating, review) => savePersonalReview(detailBook.id, rating, review)}
        onBrowseTag={tag => { setBrowseTag(tag); setGlobalSearch(''); setDetailsId(null); }} error={error} />
    ) : (
      <LibraryDashboard books={books} theme={settings.theme}
        cachedEpubIds={cachedEpubIds} online={online} offlineShellReady={offlineShellReady}
        cachingId={cachingId} onCacheForOffline={book => void makeAvailableOffline(book)}
        bulkOfflineProgress={bulkOfflineProgress} onCacheAllOffline={() => void saveAllOffline()}
        pendingReviewCount={books.filter(book => book.pendingReviewSync).length}
        pendingProgressCount={books.filter(book => book.pendingProgressSync).length}
        collectionsSyncPending={collectionsSyncPending}
        collections={collections.filter(c => !c.deleted)}
        onCreateCollection={createCollection}
        onRenameCollection={renameCollection}
        onDeleteCollection={deleteCollection}
        onCollectionMembership={changeCollectionMembership}
        initialTag={browseTag} globalSearch={globalSearch} onGlobalSearch={setGlobalSearch}
        onThemeChange={theme => setSettings(settings => ({ ...settings, theme }))}
        onImportClick={() => filePicker.current?.click()}
        onFiles={files => void importFiles(files)} onOpen={showDetails}
        onRead={openBook} onDelete={book => void removeBook(book)}
        importing={importing || !!loadingBook} notice={notice} error={error} storageError={storageError}
        cloudRepo={cloudRepo} cloudSession={cloudSession} cloudBusy={cloudBusy}
        cloudMessage={loadingBook ? `Opening ${loadingBook}…` : cloudMessage}
        onCloudRepo={saveCloudRepository} onCloudLogin={signInToCloud}
        onCloudLogout={signOutOfCloud} onCloudRefresh={() => void refreshCloud()}
        onCloudPublishCached={publishCachedNovels} />
    )}
    <input ref={filePicker} type="file" accept=".epub,.zip,application/epub+zip" multiple hidden
      onChange={pickerChanged} aria-label="Import EPUB or Novel ZIP" />
  </>;
}
