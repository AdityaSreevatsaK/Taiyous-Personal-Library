import CollectionToast, { type CollectionToastNotice } from './components/CollectionToast';
import type { PublicationStatus } from './lib/publication-status';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo, type ChangeEvent } from 'react';
import LibraryDashboard from './components/LibraryDashboard';
import BookDetails from './components/BookDetails';
// Keep the larger EPUB parser out of the initial library/dashboard bundle.
const Reader = lazy(() => import('./components/Reader'));
import OwnerActionDialog, { type OwnerRemovalRequest } from './components/OwnerActionDialog';
import { ownerPost } from './lib/owner';
import { extractEpubMetadata, prepareImport } from './lib/importer';
import { bookTags, normalisePersonalTags, tagCounts, tagKey } from './lib/tags';
import { namedNovelUrl, parseLibraryRoute, resolveNovelRoute } from './lib/routes';
import { libraryAuthorUrl, libraryTagUrl } from './lib/library-routes';
import { novelLibraryPageTitle } from './lib/page-titles';
import { mapWithConcurrency } from './lib/network-pool';
import { reconcileCompletedCloudRefresh } from './lib/cloud-refresh-merge';
import { partitionLocalBackups } from './lib/local-backups';
import { requestOfflineRetention } from './lib/offline';
import { readEpubWithoutCaching } from './lib/epub-access';
import { installUsageTracker } from './lib/usage-analytics';
import { deleteBook, removeCachedEpub, getBookFile, getBooks, getCachedEpubIds, getArchivedBookRecords, archiveStaleBookRecords, restoreReappearedArchivedRecords, preserveNovelMetadataForDeletion, readSettings, saveBook, updateBook, updateBooks, writeSettings } from './lib/storage';
import { staleMetadataCandidates } from './lib/stale-archive';
import { resetReadingProgress } from './lib/progress-admin';
import { isOngoingNovel, withUpdatedReadingPosition } from './lib/reading-status';
import { loadChapterCatalog } from './lib/catalog';
import BackToTop from './components/BackToTop';
import { useAppDialogs } from './components/AppDialogs';
import './components/back-to-top.css';
import {
  reconcileCloudLibrary, clearCloudSession, createCloudSession, discoverHostedOAuthSession, assertPrivateDataset,
  fetchCloudCatalog, fetchCloudEpub, deleteCloudNovel, hostedEpubExists, fetchCloudArchive, findCloudEntryForBook, readDatasetRepo, saveDatasetRepo,
  uploadNovelToCloud, validateDatasetRepo,
  type CloudEntry, type CloudSession,
} from './lib/cloud';
import type { LibraryBook, ReaderSettings } from './types';
import {
  readLocalCollections, writeLocalCollections, readCollectionsPending, writeCollectionsPending,
  readCollectionsCloudRevision, writeCollectionsCloudRevision,
  readCollectionsConflict, writeCollectionsConflict,
  collectionChildren, moveCollection, deleteCollectionPreservingChildren, collectionMembershipPaths,
  type BookCollection,
} from './lib/collections';
import { reconcileCollections, resolveCollections, type CollectionsOutcome } from './lib/collections-sync';
import { syncReadingRecord, syncReviewRecord, resolveReadingConflict, resolveReviewConflict } from './lib/personal-sync';
import { nextLocalEditTimestamp } from './lib/revision-sync';

export default function App() {
  const { confirm } = useAppDialogs();
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [settings, setSettings] = useState<ReaderSettings>(readSettings);
  const [routePath, setRoutePath] = useState(() => window.location.pathname);
  useEffect(() => {
    const icon = document.getElementById('taiyou-favicon') as HTMLLinkElement | null;
    if (!icon) return;
    const light = settings.theme === 'light' || settings.theme === 'ocean' || settings.theme === 'sepia';
    icon.href = light ? '/branding/favicon-transparent-light.svg' : '/branding/favicon-transparent-dark.svg';
  }, [settings.theme]);

  const [readingId, setReadingId] = useState<string | null>(() => {
    const route = parseLibraryRoute(window.location.pathname);
    return route.page === 'reader' && 'id' in route ? route.id : null;
  });
  const [startChapterHref, setStartChapterHref] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(() => {
    const route = parseLibraryRoute(window.location.pathname);
    return route.page === 'library' || !('id' in route) ? null : route.id;
  });
  const [browseTag, setBrowseTag] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');
  const [collections, setCollections] = useState<BookCollection[]>(readLocalCollections);
  const [collectionsSyncPending, setCollectionsSyncPending] = useState(readCollectionsPending);
  const [collectionsConflict, setCollectionsConflict] = useState(readCollectionsConflict);
  // Update tab titles on navigation, browser Back/Forward and metadata renames.
  useEffect(() => { document.title = novelLibraryPageTitle(routePath, books, collections); },
    [routePath, books, collections]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [collectionToasts, setCollectionToasts] = useState<CollectionToastNotice[]>([]);
  const nextCollectionToastId = useRef(0);
  // With an OAuth-backed catalogue, never render historical IndexedDB books
  // before the authoritative hosted catalogue has been checked.
  const [localLoaded, setLocalLoaded] = useState(false);
  const [oauthChecked, setOauthChecked] = useState(!navigator.onLine);
  const [initialCloudLoaded, setInitialCloudLoaded] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [cloudSession, setCloudSession] = useState<CloudSession | null>(null);
  const [cloudRepo, setCloudRepo] = useState(readDatasetRepo);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const [staleCount, setStaleCount] = useState(0);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [offlineRetention, setOfflineRetention] = useState<'persistent' | 'best-effort' | 'unknown'>('unknown');
  const [ownerRequest, setOwnerRequest] = useState<OwnerRemovalRequest | null>(null);
  const [loadingBook, setLoadingBook] = useState<string | null>(null);
  const [cachedEpubIds, setCachedEpubIds] = useState<string[]>([]);
  // Only explicit Save offline/import writes EPUBs to IndexedDB. Reading and
  // reader bookmarks use a single short-lived in-memory Blob instead.
  const [readerFile, setReaderFile] = useState<{ id: string; epub: Blob } | null>(null);
  const readerFileRef = useRef<{ id: string; epub: Blob } | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [offlineShellReady, setOfflineShellReady] = useState(false);
  const [, setCachingId] = useState<string | null>(null);
  const [bulkOfflineProgress, setBulkOfflineProgress] = useState<{ done: number; total: number } | null>(null);
  const filePicker = useRef<HTMLInputElement | null>(null);
  // A successful EPUB export is required IN THIS SESSION before Master
  // Controls offers destructive deletion of that immutable novel ID.
  const masterExportedEpubs = useRef(new Set<string>());
  const booksRef = useRef<LibraryBook[]>([]);
  const collectionsRef = useRef<BookCollection[]>(collections);
  const cloudEntries = useRef<Map<string, CloudEntry>>(new Map());
  const busyRef = useRef(false);
  const syncRef = useRef(false);
  // A successful cloud catalogue fetch enables safe hiding of stale listings.
  // Never delete local records or cached EPUBs as a side effect of syncing.
  const verifiedCloudCatalogue = useRef(false);
  const deepLinkFetches = useRef(new Set<string>());
  /** An acknowledgement for an earlier edit must never clear newer edits. */
  const applyCollectionsOutcome = useCallback((outcome: CollectionsOutcome, snapshot: BookCollection[]) => {
    writeCollectionsCloudRevision(outcome.baseRevision);
    writeCollectionsConflict(outcome.conflict);
    setCollectionsConflict(outcome.conflict);
    if (JSON.stringify(collectionsRef.current) !== JSON.stringify(snapshot)) {
      writeCollectionsPending(true);
      setCollectionsSyncPending(true);
      return;
    }
    collectionsRef.current = outcome.collections;
    writeLocalCollections(outcome.collections);
    setCollections(outcome.collections);
    writeCollectionsPending(outcome.pending);
    setCollectionsSyncPending(outcome.pending);
  }, []);
  // An in-flight fetch can outlive a catalogue rerender. Track the current
  // route rather than cancelling its only fetch when React effects restart.
  const liveReadingId = useRef(readingId);
  liveReadingId.current = readingId;
  const readingForUsage = useRef<string | null>(null);
  const onlineForUsage = useRef(online);
  readingForUsage.current = readingId && readerFile?.id === readingId ? readingId : null;
  onlineForUsage.current = online;
  // One tracker for the entire SPA lifetime. Never run trackers per rerender.
  useEffect(() => installUsageTracker(
    () => readingForUsage.current,
    () => onlineForUsage.current,
  ), []);

  const navigate = useCallback((path: string, replace = false) => {
    if (window.location.pathname !== path) {
      window.history[replace ? 'replaceState' : 'pushState'](null, '', path);
    }
    setRoutePath(path);
  }, []);
  // The SPA keeps its root scrolling element across page changes.
  // A novel details page must ALWAYS open at its top, not at the previous
  // catalogue scroll position. Also reset on browser Back/Forward routes.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
  }, [routePath]);

  const goLibrary = useCallback(() => {
    // Every Home/logo action must return to the actual homepage, not revive a
    // previous search, filtered shelf or collection from shared React state.
    setGlobalSearch('');
    setBrowseTag('');
    setReadingId(null);
    setDetailsId(null);
    setStartChapterHref(null);
    navigate('/');
  }, [navigate]);
  const browseLibraryFromNovel = useCallback((path: string) => {
    setReadingId(null);
    setDetailsId(null);
    setStartChapterHref(null);
    setBrowseTag('');
    setGlobalSearch('');
    navigate(path);
  }, [navigate]);
  useEffect(() => {
    const updateFromURL = () => {
      const path = window.location.pathname;
      const route = parseLibraryRoute(path);
      const book = resolveNovelRoute(route, booksRef.current);
      const id = route.page === 'library' ? null : 'id' in route ? route.id : book?.id ?? null;
      setRoutePath(path);
      setDetailsId(id);
      setReadingId(route.page === 'reader' ? id : null);
      setStartChapterHref(null);
    };
    window.addEventListener('popstate', updateFromURL);
    return () => window.removeEventListener('popstate', updateFromURL);
  }, []);

  // A name-only deep link is resolved as soon as the local/cloud catalogue is
  // available. Legacy /book/<id> bookmarks are canonicalised without reloading.
  // Never use a title slug as a storage/progress identifier.
  useEffect(() => {
    // A reader relocation can replaceState its chapter number without
    // re-rendering the SPA. Always derive canonical URLs from the LIVE path,
    // otherwise a progress update could silently strip /chapter-N.
    const route = parseLibraryRoute(window.location.pathname);
    const book = resolveNovelRoute(route, books);
    if (!book) return;
    setDetailsId(book.id);
    setReadingId(route.page === 'reader' ? book.id : null);
    const canonical = namedNovelUrl(
      book, books, route.page === 'reader', route.page === 'reader' ? route.chapter : undefined,
    );
    if (window.location.pathname !== canonical) {
      window.history.replaceState(null, '', canonical + window.location.search + window.location.hash);
    }
  }, [routePath, books]);

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
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(id);
  }, [notice]);
   useEffect(() => { writeSettings(settings); }, [settings]);
  useEffect(() => {
    // Remove a short-lived OAuth session previously stored by older builds.
    clearCloudSession();
    let active = true;
    Promise.all([getBooks(), getCachedEpubIds()]).then(([saved, cachedIds]) => {
      if (!active) return;
      const shown = verifiedCloudCatalogue.current
        ? reconcileCloudLibrary([...cloudEntries.current.values()], saved, cachedIds).books : saved;
      booksRef.current = shown;
      setBooks(shown);
      setCachedEpubIds(cachedIds);
    }).catch(() => {
      if (active) setStorageError('This browser cannot open your local library. Enable IndexedDB or use a normal browsing window.');
    }).finally(() => {
      if (active) setLocalLoaded(true);
    });
    return () => { active = false; };
  }, []);

  // After Hugging Face OAuth signs the reader in on the production Cloudflare
  // hostname, discover the private dataset session automatically.
  // No Hugging Face token is ever copied to browser state or local storage.
  useEffect(() => {
    let active = true;
    const connect = async () => {
      try {
        const detected = await discoverHostedOAuthSession();
        if (!active || !detected) return;
        try { saveDatasetRepo(detected.repo); } catch { /* localStorage may be unavailable */ }
        setCloudRepo(detected.repo);
        setCloudSession(detected.session);
        setCloudMessage('Private dataset connected through your Hugging Face login.');
      } finally {
        if (active) setOauthChecked(true);
      }
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
      // A previously removed dataset can be restored later. Recover archived
      // annotations for exact immutable IDs before blending cloud metadata.
      await restoreReappearedArchivedRecords(catalog.books.map(entry => entry.id));
      // The cloud catalogue is authoritative for hosted novels. Preserve actual
      // offline EPUBs, but hide old cloud metadata with no hosted file or cache.
      // This does not remove records, ratings, progress or EPUBs from IndexedDB.
      const [local, cachedIds] = await Promise.all([getBooks(), getCachedEpubIds()]);
      const { books: merged, hiddenStaleEntries } =
        reconcileCloudLibrary(catalog.books, local, cachedIds);
      verifiedCloudCatalogue.current = true;
      setStaleCount(hiddenStaleEntries);
      setCachedEpubIds(cachedIds);
      // Publish the *reconciled* count immediately. Personal ratings/progress
      // continue loading separately and must not block the page or show 181.
      booksRef.current = merged;
      setBooks(merged);
      setInitialCloudLoaded(true);
      // Legacy manual-token sessions can read EPUBs. Only OAuth sessions have
      // the authenticated, revision-checked write boundary for personal data.
      if (session.via !== 'oauth') {
        setCloudMessage('Hosted novels loaded read-only. Sign in with Hugging Face to synchronise reading positions, notes and collections.');
        setLastSyncError(null);
        return;
      }

      let notesWarning = false;
      const synced = await mapWithConcurrency(merged, 5, async book => {
        const entry = findCloudEntryForBook(catalog.books, book);
        if (!entry) return book;
        try { return await syncReviewRecord(repo, session, entry.id, book); }
        catch { notesWarning = true; return book; }
      });
      let progressWarning = false;
      const withProgress = await mapWithConcurrency(synced, 5, async book => {
        const entry = findCloudEntryForBook(catalog.books, book);
        if (!entry) return book;
        try { return await syncReadingRecord(repo, session, entry.id, book); }
        catch { progressWarning = true; return book; }
      });
      // Reconcile against the live reader, not the start-of-refresh snapshot.
      // A newly recorded scroll or rating must survive an in-flight refresh.
      const currentBooks = reconcileCompletedCloudRefresh(merged, withProgress, booksRef.current);
      booksRef.current = currentBooks;
      setBooks(currentBooks);
      await updateBooks(currentBooks.filter(book => book.cloud));
      let collectionsWarning = false;
      try {
        const snapshot = collectionsRef.current;
        const outcome = await reconcileCollections(repo, session, snapshot,
          readCollectionsPending(), readCollectionsCloudRevision(), readCollectionsConflict());
        applyCollectionsOutcome(outcome, snapshot);
      } catch {
        collectionsWarning = true;
        writeCollectionsPending(true);
        setCollectionsSyncPending(true);
      }
      const conflictCount = currentBooks.reduce((count, book) =>
        count + Number(!!book.progressSyncConflict) + Number(!!book.reviewSyncConflict), 0) +
        Number(!!readCollectionsConflict());
      setCloudMessage(`${catalog.books.length} hosted ${catalog.books.length === 1 ? 'novel' : 'novels'} in the current dataset.${hiddenStaleEntries ? ` Hidden ${hiddenStaleEntries} stale book entries without a current cloud listing or saved EPUB. Their browser metadata and progress were preserved.` : ''}${notesWarning ? ' Some personal notes could not be synced.' : ''}${progressWarning ? ' Some reading progress could not be synced.' : ''}${collectionsWarning ? ' Collections sync needs a retry.' : ''}${conflictCount ? ' ' + conflictCount + ' cross-device conflict(s) require a decision in Cloud Settings.' : ''}`);
      setLastSyncError(notesWarning || progressWarning || collectionsWarning
        ? 'Some private changes could not be synchronised. Your local data is preserved; use Refresh cloud to retry.'
        : conflictCount ? 'Cross-device edits differ. Both versions are preserved until you resolve the conflicts in Cloud Settings.' : null);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setCloudMessage('Cloud library unavailable: ' + message);
      setLastSyncError('Cloud refresh failed: ' + message);
      if (/Recovery required|malformed|catalogue is missing/i.test(message)) {
        setError('Private library requires recovery: ' + message);
      }
    } finally {
      setInitialCloudLoaded(true);
      setCloudBusy(false);
      syncRef.current = false;
    }
  }, [cloudRepo, cloudSession, applyCollectionsOutcome]);

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
      let syncFailures = 0;
      try {
        for (const snapshot of booksRef.current.filter(book => book.cloud && book.pendingProgressSync)) {
          const entry = findCloudEntryForBook([...cloudEntries.current.values()], snapshot);
          if (!entry) continue;
          try {
            const current = booksRef.current.find(book => book.id === snapshot.id);
            if (!current?.pendingProgressSync) continue;
            const localTimestamp = current.progressUpdatedAt ?? 0;
            const updated = await syncReadingRecord(cloudRepo, cloudSession, entry.id, current);
            if (updated.progressSyncConflict) {
              syncFailures++;
              setLastSyncError('A reading position conflicts with another device. Compare both copies in Cloud Settings.');
            }
            // A new scroll may have occurred during upload; never clear newer edits.
            const latest = booksRef.current.find(book => book.id === snapshot.id);
            if (latest && latest.progressUpdatedAt === localTimestamp) {
              // Only change the reading slice; leave any newer local review/tag intact.
              const merged = { ...latest, progress: updated.progress,
                completedAt: updated.completedAt,
                currentChapter: updated.currentChapter,
                currentChapterIndex: updated.currentChapterIndex,
                currentChapterNumber: updated.currentChapterNumber,
                lastCfi: updated.lastCfi, lastOpenedAt: updated.lastOpenedAt,
                progressUpdatedAt: updated.progressUpdatedAt,
                pendingProgressSync: updated.pendingProgressSync,
                progressCloudRevision: updated.progressCloudRevision,
                progressSyncConflict: updated.progressSyncConflict };
              booksRef.current = booksRef.current.map(book => book.id === latest.id ? merged : book);
              setBooks(booksRef.current);
              await updateBook(merged);
            }
          } catch (reason) {
            // Leave the pending flag set for a later authorised retry and make
            // the repeated failure visible under Cloud library > Settings.
            syncFailures++;
            const message = reason instanceof Error ? reason.message : String(reason);
            setLastSyncError('Reading positions are waiting to sync (' + syncFailures +
              ' failed attempt(s) in the latest cycle): ' + message.slice(0, 140));
          }
        }
        if (!syncFailures && !booksRef.current.some(book => book.pendingProgressSync || book.progressSyncConflict)) {
          // A successful progress retry must not clear unrelated notes or
          // collections warnings; those need their own successful refresh.
          setLastSyncError(previous => previous?.startsWith('Reading positions') ? null : previous);
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
              const hasLocalNotes = !!(current.shelfStatus || current.personalRating ||
                current.personalReview?.trim());
              await updateBook({
                ...current, cloud: true,
                ...(hasLocalNotes ? { pendingReviewSync: true,
                  personalReviewUpdatedAt: current.personalReviewUpdatedAt || Date.now() } : {}),
              });
            } catch (reason) {
              failures.push(`${file.name}: saved on this device, but CLOUD UPLOAD FAILED: ${String(reason)}`);
            }
          }
        } catch (reason) {
          failures.push(`${file.name}: ${reason instanceof Error ? reason.message : String(reason)}`);
        }
      }
      const [latest, cachedIds] = await Promise.all([getBooks(), getCachedEpubIds()]);
      const visible = verifiedCloudCatalogue.current
        ? reconcileCloudLibrary([...cloudEntries.current.values()], latest, cachedIds).books
        : latest;
      booksRef.current = visible;
      setBooks(visible);
      setCachedEpubIds(cachedIds);
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
            const hasLocalNotes = !!(book.shelfStatus || book.personalRating ||
              book.personalReview?.trim());
            await updateBook({
              ...book, cloud: true,
              ...(hasLocalNotes ? { pendingReviewSync: true,
                personalReviewUpdatedAt: book.personalReviewUpdatedAt || Date.now() } : {}),
            });
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

  // Reading a hosted EPUB is not an opt-in download. Prefer any existing
  // offline copy, otherwise fetch a VERIFIED cloud EPUB into memory only.
  // Never call saveBook(), and never change the Available offline shelf here.
  const getReadableEpub = useCallback(async (book: LibraryBook): Promise<Blob> => {
    if (readerFileRef.current?.id === book.id) return readerFileRef.current.epub;
    return readEpubWithoutCaching(book,
      getBookFile,
      async () => {
        if (!cloudRepo || !cloudSession) {
          throw new Error('Connect your private library to read this hosted EPUB.');
        }
        let entry = findCloudEntryForBook([...cloudEntries.current.values()], book);
        if (!entry) {
          const catalog = await fetchCloudCatalog(validateDatasetRepo(cloudRepo), cloudSession);
          cloudEntries.current = new Map(catalog.books.map(item => [item.id, item]));
          entry = findCloudEntryForBook(catalog.books, book);
        }
        if (!entry) {
          throw new Error(`No matching hosted EPUB was found for "${book.title}" after refreshing the private catalogue. Check the catalogue and original files; do not re-upload or delete anything yet.`);
        }
        return fetchCloudEpub(cloudRepo, entry, cloudSession);
      },
    );
  }, [cloudRepo, cloudSession]);

  // ONLY these explicit Save offline operations persist an EPUB. A previous
  // reader session may already have the Blob in memory, so avoid fetching it
  // again, but do not mistake a transient read for an offline save.
  const ensureCached = useCallback(async (book: LibraryBook) => {
    try { await getBookFile(book.id); return; }
    catch { /* This novel may be hosted but not explicitly saved for offline use. */ }
    const epub = await getReadableEpub(book);
    const current = booksRef.current.find(item => item.id === book.id) || book;
    await saveBook(current, epub);
    setCachedEpubIds(ids => ids.includes(book.id) ? ids : [...ids, book.id]);
  }, [getReadableEpub]);

  // Deep links must work even when a book has never been saved offline.
  // Keep the returned Blob for this tab only; do not persist it to IndexedDB.
  useEffect(() => {
    if (!readingId || !books.length || readerFile?.id === readingId ||
        deepLinkFetches.current.has(readingId)) return;
    const target = books.find(book => book.id === readingId);
    if (!target) return;
    deepLinkFetches.current.add(readingId);
    setLoadingBook(target.title);
    void getReadableEpub(target).then(epub => {
      if (liveReadingId.current !== target.id) return;
      const prepared = { id: target.id, epub };
      readerFileRef.current = prepared;
      setReaderFile(prepared);
      setError(null);
    }).catch(reason => {
      if (liveReadingId.current !== target.id) return;
      setError('Unable to open this bookmark: ' + String(reason));
      setReadingId(null);
      setDetailsId(target.id);
      navigate(namedNovelUrl(target, booksRef.current), true);
    }).finally(() => {
      deepLinkFetches.current.delete(target.id);
      if (liveReadingId.current === target.id) setLoadingBook(null);
    });
  }, [readingId, books, readerFile?.id, getReadableEpub]);

  const makeAvailableOffline = useCallback(async (book: LibraryBook) => {
    setCachingId(book.id);
    setError(null);
    try {
      if (!online && !cachedEpubIds.includes(book.id)) throw new Error('Connect to the internet and the private novel dataset to cache this EPUB.');
      await ensureCached(book);
      setCachedEpubIds(ids => ids.includes(book.id) ? ids : [...ids, book.id]);
      // Request more durable browser storage when the user explicitly downloads.
      const retention = await requestOfflineRetention();
      setOfflineRetention(retention);
      setNotice(`"${book.title}" is saved for offline use on this device. ${retention === 'persistent'
        ? 'Persistent browser storage was granted, though exporting a backup is still recommended.'
        : 'Browser storage may be cleared automatically. Export an EPUB backup.'}`);
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
    const locallyAvailable = new Set(await getCachedEpubIds());
    const needed = booksRef.current.filter(book => !locallyAvailable.has(book.id));
    if (!needed.length) {
      setNotice('Every novel is already available offline on this device.');
      return;
    }
    // Hundreds of EPUBs may consume gigabytes. Never begin a bulk offline
    // download through an accidental tap or without an explicit decision.
    if (!await confirm({
      title: 'Save all novels offline?',
      message: `Download ${needed.length} EPUBs into this browser for offline reading? This can use substantial storage. You can remove hosted copies individually later.`,
      confirmLabel: `Save ${needed.length} offline`,
    })) return;
    setNotice(null);
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
      const retention = await requestOfflineRetention();
      setOfflineRetention(retention);
      const successful = done - failures.filter(x => x.includes(': ')).length;
      setNotice(`${successful} of ${needed.length} novels cached for offline reading. ${retention === 'persistent'
        ? 'Persistent browser storage granted.'
        : 'Browser storage may be cleared automatically; keep a separate ZIP/EPUB backup.'}`);
      if (failures.length) setError(`Some downloads could not finish: ${failures.slice(0, 3).join(' | ')}`);
    } finally {
      setBulkOfflineProgress(null);
    }
  }, [bulkOfflineProgress, ensureCached, confirm]);

  // Details are catalogue metadata. Never block page navigation on fetching an
  // EPUB (which can exceed 100 MB). Chapter previews and ordinary reading
  // fetch transiently; only explicitly chosen offline actions persist files.
  const showDetails = useCallback((book: LibraryBook) => {
    setError(null);
    setNotice(null);
    setLoadingBook(null);
    setReadingId(null);
    setStartChapterHref(null);
    setDetailsId(book.id);
    navigate(namedNovelUrl(book, booksRef.current));
  }, []);

  // Older locally imported EPUBs can need metadata enrichment. Preserve that
  // behaviour after the details have painted, and only from existing offline
  // content. Never download a private/cloud EPUB merely to show metadata.
  const metadataScansInFlight = useRef(new Set<string>());
  useEffect(() => {
    const id = detailsId;
    if (!id || readingId || !cachedEpubIds.includes(id)) return;
    const target = booksRef.current.find(item => item.id === id);
    if (!target || target.metadataScanned || metadataScansInFlight.current.has(id)) return;
    let cancelled = false;
    const scan = () => {
      if (cancelled || metadataScansInFlight.current.has(id)) return;
      metadataScansInFlight.current.add(id);
      void (async () => {
        try {
          const file = await getBookFile(id);
          const parsed = await extractEpubMetadata(file);
          const current = booksRef.current.find(item => item.id === id);
          if (!current || current.metadataScanned) return;
          const updated: LibraryBook = {
            ...current,
            description: current.description || parsed.description,
            sourceTags: current.sourceTags?.length ? current.sourceTags : parsed.sourceTags,
            sourceUrl: current.sourceUrl || parsed.sourceUrl,
            status: current.status || parsed.status,
            chapterCount: current.chapterCount || parsed.chapterCount,
            metadataScanned: true,
          };
          await updateBook(updated);
          booksRef.current = booksRef.current.map(item => item.id === id ? updated : item);
          setBooks(booksRef.current);
        } catch {
          // The catalogue/details remain usable even if optional enrichment fails.
        } finally {
          metadataScansInFlight.current.delete(id);
        }
      })();
    };
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(scan, { timeout: 2300 });
      return () => { cancelled = true; window.cancelIdleCallback(handle); };
    }
    const handle = setTimeout(scan, 450);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [detailsId, readingId, cachedEpubIds]);

  const markNovelCompleted = useCallback(async (bookId: string) => {
    const current = booksRef.current.find(book => book.id === bookId);
    if (!current) throw new Error('Novel no longer exists');
    if (isOngoingNovel(current)) throw new Error('This novel is still ongoing. Reaching its latest chapter means Caught up, not Finished.');
    if (current.completedAt) return;
    const updatedAt = Math.max(Date.now(), (current.progressUpdatedAt || 0) + 1);
    const updated: LibraryBook = { ...current, progress:100, completedAt:updatedAt, progressUpdatedAt:updatedAt,
      pendingProgressSync:!!current.cloud, shelfStatus:undefined };
    await updateBook(updated);
    booksRef.current = booksRef.current.map(book => book.id === bookId ? updated : book);
    setBooks(booksRef.current);
    if (updated.cloud && cloudSession && cloudRepo) {
      const entry = findCloudEntryForBook([...cloudEntries.current.values()], updated);
      if (!entry) throw new Error('Marked as completed locally; remote novel is not listed for cloud sync.');
      try {
        const result = await syncReadingRecord(cloudRepo, cloudSession, entry.id, updated);
        const latest = booksRef.current.find(book => book.id === bookId);
        if (latest?.progressUpdatedAt === updatedAt) {
          const synced = { ...latest,
            progressCloudRevision: result.progressCloudRevision,
            progressSyncConflict: result.progressSyncConflict,
            pendingProgressSync: result.pendingProgressSync };
          await updateBook(synced);
          booksRef.current = booksRef.current.map(book => book.id === bookId ? synced : book);
          setBooks(booksRef.current);
        }
        if (result.progressSyncConflict) {
          setLastSyncError('Completion was saved locally; the cloud position conflicts with another device.');
        }
      } catch (reason) {
        throw new Error('Marked as completed on this device. Cloud progress will retry: ' + String(reason));
      }
    }
  }, [cloudRepo, cloudSession]);

  const savePersonalTags = useCallback(async (bookId: string, tags: string[]) => {
    const current = booksRef.current.find(book => book.id === bookId);
    if (!current) return;
    const knownTags = booksRef.current.flatMap(bookTags);
    const imported = new Set((current.sourceTags || []).map(tagKey));
    const updated = { ...current,
      personalTags: normalisePersonalTags(tags, knownTags)
        .filter(tag => !imported.has(tagKey(tag))) };
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

  const savePersonalReview = useCallback(async (bookId: string, rating: number | undefined, review: string, trialStatus?: 'trying' | 'regular') => {
    const current = booksRef.current.find(book => book.id === bookId);
    if (!current) throw new Error('Novel not found in local library');
    if (rating !== undefined && (!Number.isInteger(rating) || rating < 1 || rating > 10)) {
      throw new Error('Rating must be between 1 and 10');
    }
    const updatedAt = nextLocalEditTimestamp(Date.now(), current.personalReviewUpdatedAt);
    const updated = { ...current, personalRating: rating, personalReview: review.trim().slice(0, 10000),
       shelfStatus: trialStatus === 'trying' ? 'trying' as const : trialStatus === 'regular' ? undefined : current.shelfStatus,
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
        const result = await syncReviewRecord(cloudRepo, cloudSession, entry.id, updated);
        const latest = booksRef.current.find(item => item.id === bookId);
        if (latest && latest.personalReviewUpdatedAt === updatedAt) {
          const synced = { ...latest,
            reviewCloudRevision: result.reviewCloudRevision,
            reviewSyncConflict: result.reviewSyncConflict,
            pendingReviewSync: result.pendingReviewSync };
          await updateBook(synced);
          booksRef.current = booksRef.current.map(item => item.id === bookId ? synced : item);
          setBooks(booksRef.current);
        }
        if (result.reviewSyncConflict) {
          setLastSyncError('Your notes were saved locally. A cloud conflict needs your choice in Settings.');
        }
      } catch (error) {
        throw new Error(`Saved on this device, but cloud synchronisation failed: ${String(error)}`);
      }
    }
  }, [cloudRepo, cloudSession]);

  const downloadFile = useCallback((blob: Blob, title: string, extension: 'epub' | 'zip' | 'json') => {
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
      // An exported EPUB goes to the user's normal Downloads folder. It does
      // not silently create a second permanent browser-side offline copy.
      downloadFile(await getReadableEpub(book), book.title, 'epub');
    } catch (error) {
      setError(`Unable to download EPUB: ${String(error)}`);
      throw error;
    } finally { setLoadingBook(null); }
  }, [getReadableEpub, downloadFile]);

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
    if (cloudRepo && cloudSession?.via === 'oauth') {
      try {
        const outcome = await reconcileCollections(cloudRepo, cloudSession, next, true,
          readCollectionsCloudRevision(), readCollectionsConflict());
        applyCollectionsOutcome(outcome, next);
        if (outcome.conflict) {
          setLastSyncError('Collections saved locally. Compare the competing private cloud copy in Cloud Settings.');
        }
      } catch (cause) {
        setError('Collections saved on this device, but cloud sync failed: ' + String(cause));
      }
    }
  }, [cloudRepo, cloudSession, applyCollectionsOutcome]);

  const createCollection = useCallback(async (name: string, parentId?: string) => {
    const cleaned = name.trim().slice(0, 90);
    if (!cleaned) return;
    await changeCollections(current => {
      if (parentId && !current.some(c => !c.deleted && c.id === parentId))
        throw new Error('Parent collection no longer exists.');
      // Names need only be unique among siblings; nested series can reuse names.
      if (collectionChildren(current, parentId || null).some(c =>
        c.name.toLocaleLowerCase() === cleaned.toLocaleLowerCase())) return current;
      return [...current, { id: crypto.randomUUID(), name: cleaned, bookIds: [],
        ...(parentId ? { parentId } : {}), updatedAt: Date.now() }];
    });
  }, [changeCollections]);

  const changeCollectionParent = useCallback(async (collectionId: string, parentId: string | null) => {
    await changeCollections(current => moveCollection(current, collectionId, parentId));
  }, [changeCollections]);

  const notifyCollectionSaved = useCallback((collectionId: string, action: 'added' | 'removed') => {
    const collection = collectionsRef.current.find(item => item.id === collectionId && !item.deleted);
    const pendingCloud = Boolean(cloudRepo && cloudSession && readCollectionsPending());
    const toast: CollectionToastNotice = {
      id: ++nextCollectionToastId.current,
      title: action === 'added' ? `Added to ${collection?.name || 'collection'}` : `Removed from ${collection?.name || 'collection'}`,
      detail: pendingCloud ? 'Saved on this device. Cloud sync pending.'
        : cloudSession ? 'Saved to your private library.' : 'Saved on this device.',
    };
    setCollectionToasts(current => [toast, ...current].slice(0, 4));
  }, [cloudRepo, cloudSession]);

  const changeCollectionMembership = useCallback(async (collectionId: string, bookId: string, include: boolean) => {
    const target = collectionsRef.current.find(c => c.id === collectionId && !c.deleted);
    if (!target) throw new Error('Collection no longer exists.');
    if (!booksRef.current.some(b => b.id === bookId)) throw new Error('Novel no longer exists.');
    if (target.bookIds.includes(bookId) === include) return;
    await changeCollections(current => current.map(c => {
      if (c.id !== collectionId || c.deleted) return c;
      const ids = new Set(c.bookIds);
      if (include) ids.add(bookId); else ids.delete(bookId);
      return { ...c, bookIds: [...ids], updatedAt: Math.max(Date.now(), c.updatedAt + 1) };
    }));
    notifyCollectionSaved(collectionId, include ? 'added' : 'removed');
  }, [changeCollections, notifyCollectionSaved]);

  const createCollectionWithNovel = useCallback(async (bookId: string, name: string, parentId?: string) => {
    const cleaned = name.normalize('NFKC').trim().slice(0, 90);
    if (!cleaned) throw new Error('Enter a collection name.');
    if (!booksRef.current.some(b => b.id === bookId)) throw new Error('Novel no longer exists.');
    const id = crypto.randomUUID();
    await changeCollections(current => {
      if (parentId && !current.some(item => item.id === parentId && !item.deleted)) {
        throw new Error('Parent collection no longer exists.');
      }
      if (collectionChildren(current, parentId || null).some(item =>
        item.name.toLocaleLowerCase() === cleaned.toLocaleLowerCase())) {
        throw new Error('A collection with this name already exists at that level.');
      }
      return [...current, {
        id, name: cleaned, bookIds: [bookId],
        ...(parentId ? { parentId } : {}), updatedAt: Date.now(),
      }];
    });
    notifyCollectionSaved(id, 'added');
  }, [changeCollections, notifyCollectionSaved]);

  const renameCollection = useCallback(async (collectionId: string, name: string) => {
    const cleaned = name.trim().slice(0, 90);
    if (!cleaned) return;
    await changeCollections(current => current.map(c => c.id === collectionId && !c.deleted
      ? { ...c, name: cleaned, updatedAt: Math.max(Date.now(), c.updatedAt + 1) } : c));
  }, [changeCollections]);

  const deleteCollection = useCallback(async (collectionId: string) => {
    await changeCollections(current => deleteCollectionPreservingChildren(current, collectionId));
  }, [changeCollections]);

  const openBook = useCallback((book: LibraryBook, chapterHref?: string) => {
    setLoadingBook(book.title);
    void (async () => {
      try {
        const epub = await getReadableEpub(book);
        const prepared = { id: book.id, epub };
        readerFileRef.current = prepared;
        setReaderFile(prepared);
        const current = booksRef.current.find(item => item.id === book.id) || book;
        const updated = { ...current, lastOpenedAt: Date.now() };
        booksRef.current = booksRef.current.map(item => item.id === book.id ? updated : item);
        setBooks(booksRef.current);
        setStartChapterHref(chapterHref || null);
        await updateBook(updated);
        setDetailsId(book.id);
        setReadingId(book.id);
        navigate(namedNovelUrl(book, booksRef.current, true));
        setError(null);
        setNotice(null);
      } catch (reason) { setError(`Unable to open novel: ${String(reason)}`); }
      finally { setLoadingBook(null); }
    })();
  }, [getReadableEpub]);

  const recordProgress = useCallback((patch: Partial<LibraryBook>) => {
    if (!readingId) return;
    const current = booksRef.current.find(item => item.id === readingId);
    if (!current) return;
    const updated = withUpdatedReadingPosition(current, patch);
    booksRef.current = booksRef.current.map(book => book.id === readingId ? updated : book);
    setBooks(booksRef.current);
    void updateBook(updated).catch(() => setStorageError('Reading progress could not be saved. Check available browser storage.'));
  }, [readingId]);

  // UI actions only request an owner-authenticated confirmation. The owner
  // dialog performs a fresh server-side privilege verification before execution.
  const removeBook = useCallback((book: LibraryBook) => {
    setOwnerRequest({ kind: book.cloud ? 'hosted-novel' : 'local-novel', id: book.id, title: book.title });
  }, []);

  // Offline storage is device-only housekeeping, not deletion of a novel.
  // Ask for a normal confirmation, then protect the reader's last good copy by
  // verifying that the corresponding EPUB actually exists in the private cloud.
  const requestRemoveOffline = useCallback(async (book: LibraryBook) => {
    setError(null);
    const entry = cloudEntries.current.get(book.id);
    if (!book.cloud || !entry || !cloudRepo || cloudSession?.via !== 'oauth' || !navigator.onLine) {
      setError('Cannot verify a hosted backup right now. The local EPUB has been kept.');
      return;
    }
    if (!await confirm({
      title: 'Remove offline download?',
      message: 'Remove the offline EPUB for “' + book.title + '” from this device? Your cloud novel, notes and reading progress remain.',
      confirmLabel: 'Remove download', destructive: true,
    })) return;
    try {
      if (!(await hostedEpubExists(cloudRepo, entry, cloudSession))) {
        throw new Error('Hosted EPUB is missing or inaccessible. The local copy was kept.');
      }
      await removeCachedEpub(book.id);
      setCachedEpubIds(ids => ids.filter(id => id !== book.id));
      setNotice(`Offline download for “${book.title}” removed from this device.`);
    } catch (reason) { setError(`Could not remove offline download: ${String(reason)}`); }
  }, [cloudRepo, cloudSession, confirm]);

  const requestDeleteCollection = useCallback((collectionId: string) => {
    const collection = collectionsRef.current.find(item => item.id === collectionId && !item.deleted);
    if (collection) setOwnerRequest({ kind: 'collection', id: collection.id, title: collection.name });
  }, []);

  const performOwnerAction = useCallback(async (request: OwnerRemovalRequest) => {
    // Privilege is verified on the server at the exact moment of the operation.
    // This is defence-in-depth against accidentally keeping a stale unlocked UI.
    await ownerPost('verify');
    if (request.kind === 'hosted-novel') {
      const current = booksRef.current.find(book => book.id === request.id);
      if (!current || !current.cloud || current.title !== request.title ||
          cloudSession?.via !== 'oauth' || !cloudRepo || !navigator.onLine) {
        throw new Error('A current hosted novel and signed-in HF Owner session are required');
      }
      // Server verifies the separate Owner cookie, current catalogue revision,
      // exact title and allowed storage paths before committing any deletion.
      // Preserve the complete local rating, annotations and reading position
      // before the irreversible server-side deletion.
      await preserveNovelMetadataForDeletion(current.id);
      await deleteCloudNovel(current);
      await deleteBook(current.id);
      cloudEntries.current.delete(current.id);
      const remaining = booksRef.current.filter(book => book.id !== current.id);
      booksRef.current = remaining;
      setBooks(remaining);
      setCachedEpubIds(ids => ids.filter(id => id !== current.id));
      setDetailsId(id => id === current.id ? null : id);
      navigate(request.fromMaster ? '/master-controls' : '/', true);
      setNotice(`“${current.title}” removed from your private cloud library and this browser. Keep a backup for recovery.`);
      setError(null);
      return;
    }
    if (request.kind === 'local-novel') {
      const current = booksRef.current.find(book => book.id === request.id);
      if (!current || current.cloud || current.title !== request.title) throw new Error('Local novel changed; deletion cancelled.');
      await preserveNovelMetadataForDeletion(current.id);
      await deleteBook(current.id);
      const remaining = booksRef.current.filter(book => book.id !== current.id);
      booksRef.current = remaining;
      setBooks(remaining);
      setCachedEpubIds(ids => ids.filter(id => id !== current.id));
      setDetailsId(id => id === current.id ? null : id);
      navigate(request.fromMaster ? '/master-controls' : '/', true);
      setNotice(`Local novel “${current.title}” removed from this device only.`);
      setError(null);
      return;
    }
    const collection = collectionsRef.current.find(item => item.id === request.id && !item.deleted);
    if (!collection || collection.name !== request.title) throw new Error('Collection changed; deletion cancelled.');
    await deleteCollection(collection.id);
    setNotice(`Collection “${collection.name}” deleted. Its novels and subcollections remain untouched.`);
    setError(null);
  }, [cloudRepo, cloudSession, deleteCollection]);


  // Master Controls uses the same short-lived, server-validated Owner grant
  // used for whole-novel deletion. Never embed a password in client code.
  const masterSaveRating = useCallback(async (id: string, rating: number | undefined) => {
    await ownerPost('verify');
    const current = booksRef.current.find(book => book.id === id);
    if (!current) throw new Error('Novel no longer exists; refresh this page.');
    await savePersonalReview(id, rating, current.personalReview || '');
  }, [savePersonalReview]);

  const masterCorrectMetadata = useCallback(async (id: string, title: string, author: string) => {
    await ownerPost('verify');
    const current = booksRef.current.find(book => book.id === id);
    if (!current) throw new Error('Novel no longer exists; refresh this page.');
    const cleanedTitle = title.normalize('NFKC').trim().replace(/\s+/g, ' ');
    const cleanedAuthor = author.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!cleanedTitle || cleanedTitle.length > 255 || !cleanedAuthor || cleanedAuthor.length > 160) {
      throw new Error('A valid title and author are required.');
    }
    if (current.cloud) {
      if (!navigator.onLine || cloudSession?.via !== 'oauth' || !cloudRepo) {
        throw new Error('Hosted metadata corrections require the online Hugging Face Owner session.');
      }
      const response = await fetch('/api/library?action=correct-metadata', {
        method:'POST', credentials:'same-origin', cache:'no-store',
        headers: { 'Content-Type':'application/json', 'X-Taiyou-Request':'owner-edit-metadata' },
        body:JSON.stringify({id, expectedTitle:current.title, expectedAuthor:current.author,
          title:cleanedTitle, author:cleanedAuthor}),
      });
      const outcome = await response.json().catch(() => ({})) as { error?: string; saved?: boolean };
      if (!response.ok || outcome.saved !== true) {
        throw new Error(outcome.error || 'Private metadata correction was not committed');
      }
      const entry = cloudEntries.current.get(id);
      if (entry) cloudEntries.current.set(id, {
        ...entry, metadata:{ ...entry.metadata, title:cleanedTitle, author:cleanedAuthor },
      });
    }
    const changed: LibraryBook = { ...current, title:cleanedTitle, author:cleanedAuthor };
    await updateBook(changed);
    booksRef.current = booksRef.current.map(book => book.id === id ? changed : book);
    setBooks(booksRef.current);
    setNotice('Updated title and author for “' + changed.title + '”. Original files and reading progress are unchanged.');
  }, [cloudRepo, cloudSession]);

  const masterCorrectPublicationStatus = useCallback(async (id: string, status: PublicationStatus) => {
    await ownerPost('verify');
    const current = booksRef.current.find(book => book.id === id);
    if (!current) throw new Error('Novel no longer exists; refresh Master Controls.');
    if (!['Completed', 'Ongoing', 'Hiatus', 'Dropped'].includes(status)) {
      throw new Error('Invalid publication status.');
    }
    if (current.status === status) return;
    if (current.cloud) {
      if (!navigator.onLine || cloudSession?.via !== 'oauth' || !cloudRepo) {
        throw new Error('Hosted publication corrections require an online Hugging Face Owner session.');
      }
      const response = await fetch('/api/library?action=correct-publication-status', {
        method:'POST', credentials:'same-origin', cache:'no-store',
        headers:{ 'Content-Type':'application/json', 'X-Taiyou-Request':'owner-edit-publication-status' },
        body:JSON.stringify({ id, expectedStatus:current.status || '', status }),
      });
      const outcome = await response.json().catch(() => ({})) as { saved?: boolean; error?: string };
      if (!response.ok || outcome.saved !== true) {
        throw new Error(outcome.error || 'Publication status correction was not committed');
      }
      const entry = cloudEntries.current.get(id);
      if (entry) cloudEntries.current.set(id, {
        ...entry, metadata:{ ...entry.metadata, status },
      });
    }
    const updated: LibraryBook = { ...current, status };
    await updateBook(updated);
    booksRef.current = booksRef.current.map(book => book.id === id ? updated : book);
    setBooks(booksRef.current);
    setNotice('Publication status for “' + updated.title + '” updated to ' + status +
      '. Your reading progress and EPUB remain unchanged.');
  }, [cloudRepo, cloudSession]);

  const masterMarkCompleted = useCallback(async (id: string) => {
    await ownerPost('verify');
    await markNovelCompleted(id);
  }, [markNovelCompleted]);

  const masterResetProgress = useCallback(async (id: string) => {
    await ownerPost('verify');
    const current = booksRef.current.find(book => book.id === id);
    if (!current) throw new Error('Novel no longer exists; refresh this page.');
    const updated = resetReadingProgress(current);
    await updateBook(updated);
    booksRef.current = booksRef.current.map(book => book.id === id ? updated : book);
    setBooks(booksRef.current);
    if (updated.cloud && cloudRepo && cloudSession) {
      const entry = findCloudEntryForBook([...cloudEntries.current.values()], updated);
      if (!entry) throw new Error('Progress reset locally; cloud record unavailable. Synchronisation will retry.');
      try {
        const result = await syncReadingRecord(cloudRepo, cloudSession, entry.id, updated);
        const latest = booksRef.current.find(book => book.id === id);
        if (latest && latest.progressUpdatedAt === updated.progressUpdatedAt) {
          const synced = { ...latest,
            progressCloudRevision: result.progressCloudRevision,
            progressSyncConflict: result.progressSyncConflict,
            pendingProgressSync: result.pendingProgressSync };
          await updateBook(synced);
          booksRef.current = booksRef.current.map(book => book.id === id ? synced : book);
          setBooks(booksRef.current);
        }
        if (result.progressSyncConflict) {
          setLastSyncError('Progress reset locally; the cloud copy needs explicit conflict resolution.');
        }
      } catch (reason) {
        throw new Error('Progress reset safely on this device; cloud sync will retry: ' + String(reason));
      }
    }
  }, [cloudRepo, cloudSession]);

  const masterSaveTags = useCallback(async (id: string, tags: string[]) => {
    await ownerPost('verify');
    await savePersonalTags(id, tags);
  }, [savePersonalTags]);

  const masterSaveSummary = useCallback(async (id: string, summary: string) => {
    await ownerPost('verify');
    await savePersonalSummary(id, summary);
  }, [savePersonalSummary]);

  const masterSaveReview = useCallback(async (id: string, rating: number | undefined, notes: string) => {
    await ownerPost('verify');
    await savePersonalReview(id, rating, notes);
  }, [savePersonalReview]);

  const masterExportEpub = useCallback(async (id: string) => {
    await ownerPost('verify');
    const book = booksRef.current.find(book => book.id === id);
    if (!book) throw new Error('Novel no longer exists; refresh this page.');
    await downloadEpub(book);
    // This records that the browser has initiated a full EPUB export, not
    // merely that the cloud file exists. Owner must additionally confirm the
    // download was saved successfully in the final deletion dialogue.
    masterExportedEpubs.current.add(id);
  }, [downloadEpub]);

  const masterDeleteNovel = useCallback(async (id: string) => {
    await ownerPost('verify');
    const book = booksRef.current.find(item => item.id === id);
    if (!book) throw new Error('Novel no longer exists; refresh Master Controls.');
    // Open a VISIBLE, owner-authenticated dialog immediately. It enforces
    // export of this exact immutable EPUB before a destructive operation;
    // the old invisible precondition made Delete copy appear to do nothing.
    setOwnerRequest({ kind: book.cloud ? 'hosted-novel' : 'local-novel',
      id: book.id, title: book.title, fromMaster: true });
  }, []);

  const masterArchiveStale = useCallback(async (): Promise<number> => {
    await ownerPost('verify');
    if (!cloudRepo || cloudSession?.via !== 'oauth' || !navigator.onLine) {
      throw new Error('Connect your private Hugging Face dataset first. Nothing was archived.');
    }
    // Never trust a stale UI count to decide which records may be archived.
    const remote = await fetchCloudCatalog(validateDatasetRepo(cloudRepo), cloudSession);
    const [local, cachedIds] = await Promise.all([getBooks(), getCachedEpubIds()]);
    const hostedIds = remote.books.map(entry => entry.id);
    const candidates = staleMetadataCandidates(local, hostedIds, cachedIds);
    if (!candidates.length) { setStaleCount(0); return 0; }

    // Export a human-readable recovery copy before archiving. This contains
    // personal ratings, notes and reading progress, not EPUBs or OAuth tokens.
    const existingArchive = await getArchivedBookRecords();
    const recovery = {
      version: 1, generatedAt: new Date().toISOString(),
      description: 'Taiyou Personal Library browser metadata recovery (no EPUB files)',
      previousArchive: existingArchive, newRecords: candidates,
    };
    downloadFile(new Blob([JSON.stringify(recovery, null, 2)], {
      type: 'application/json',
    }), 'Taiyous-Library-Stale-Metadata-Backup', 'json');
    // Both moving a record to archivedBooks and removing it from the active
    // 'books' store happen in a single IndexedDB transaction.
    const count = await archiveStaleBookRecords(hostedIds);
    const afterArchive = await getBooks();
    setStaleCount(staleMetadataCandidates(afterArchive, hostedIds, await getCachedEpubIds()).length);
    setCloudMessage(remote.books.length + ' current hosted novels. ' + count +
      ' historical browser-only records moved to a recoverable local archive.');
    return count;
  }, [cloudRepo, cloudSession, downloadFile]);

  const masterClearOffline = useCallback(async (): Promise<{removed:number;kept:number}> => {
    await ownerPost('verify');
    if (cloudSession?.via !== 'oauth' || !cloudRepo || !navigator.onLine) {
      throw new Error('Connect your private Hugging Face library before bulk clearing downloads.');
    }
    const cachedIds = await getCachedEpubIds();
    const results = await mapWithConcurrency(cachedIds, 4, async id => {
      const book = booksRef.current.find(item => item.id === id);
      // Never erase an unhosted or ambiguously mapped EPUB: it may be the only copy.
      const entry = cloudEntries.current.get(id);
      if (!book?.cloud || !entry || entry.id !== id) return false;
      try {
        if (!await hostedEpubExists(cloudRepo, entry, cloudSession)) return false;
        await removeCachedEpub(id);
        return true;
      } catch { return false; }
    });
    setCachedEpubIds(await getCachedEpubIds());
    const removed = results.filter(Boolean).length;
    const kept = cachedIds.length - removed;
    setNotice(removed + ' verified offline EPUBs removed. ' + kept + ' copies safely preserved.');
    return {removed,kept};
  }, [cloudRepo,cloudSession]);

  const resolveSyncConflict = useCallback(async (
    kind: 'progress' | 'review' | 'collections', bookId: string | undefined, choice: 'cloud' | 'device',
  ) => {
    if (!cloudRepo || cloudSession?.via !== 'oauth' || cloudBusy || !navigator.onLine) {
      setError('Sign in with Hugging Face and connect to resolve a private sync conflict.');
      return;
    }
    const action = choice === 'cloud' ? 'replace this device’s edit with the latest cloud copy'
      : 'replace the cloud copy with this device’s edit';
    if (!await confirm({
      title: 'Resolve private sync conflict?',
      message: 'Are you sure you want to ' + action +
        '? This action changes only this private record; both versions are shown above.',
      confirmLabel: 'Use ' + (choice === 'cloud' ? 'cloud' : 'device') + ' copy',
    })) return;
    setCloudBusy(true);
    try {
      if (kind === 'collections') {
        const snapshot = collectionsRef.current;
        if (!collectionsConflict) throw new Error('No collections conflict is waiting for review.');
        const outcome = await resolveCollections(cloudRepo, cloudSession, snapshot, choice, collectionsConflict);
        applyCollectionsOutcome(outcome, snapshot);
        if (outcome.conflict) {
          setLastSyncError('The cloud collections changed again. Both versions remain available for another choice.');
        } else setNotice('Collections conflict resolved using the ' + (choice === 'cloud' ? 'cloud' : 'device') + ' version.');
      } else {
        const current = booksRef.current.find(book => book.id === bookId);
        const entry = current && findCloudEntryForBook([...cloudEntries.current.values()], current);
        if (!current || !entry) throw new Error('The hosted novel is unavailable; both versions remain saved.');
        const startEdit = kind === 'progress' ? current.progressUpdatedAt : current.personalReviewUpdatedAt;
        const updated = kind === 'progress'
          ? await resolveReadingConflict(cloudRepo, cloudSession, entry.id, current, choice)
          : await resolveReviewConflict(cloudRepo, cloudSession, entry.id, current, choice);
        const latest = booksRef.current.find(book => book.id === bookId);
        const latestEdit = kind === 'progress' ? latest?.progressUpdatedAt : latest?.personalReviewUpdatedAt;
        if (!latest || latestEdit !== startEdit) {
          setLastSyncError('A new local edit occurred during conflict resolution. It remains pending; refresh to compare again.');
          return;
        }
        const merged = kind === 'progress'
          ? { ...latest, progress: updated.progress,
              currentChapter: updated.currentChapter, currentChapterIndex: updated.currentChapterIndex,
              currentChapterNumber: updated.currentChapterNumber, lastCfi: updated.lastCfi,
              lastOpenedAt: updated.lastOpenedAt, completedAt: updated.completedAt,
              progressUpdatedAt: updated.progressUpdatedAt,
              progressCloudRevision: updated.progressCloudRevision,
              pendingProgressSync: updated.pendingProgressSync,
              progressSyncConflict: updated.progressSyncConflict }
          : { ...latest, personalReview: updated.personalReview,
              personalRating: updated.personalRating, shelfStatus: updated.shelfStatus,
              personalReviewUpdatedAt: updated.personalReviewUpdatedAt,
              reviewCloudRevision: updated.reviewCloudRevision,
              pendingReviewSync: updated.pendingReviewSync,
              reviewSyncConflict: updated.reviewSyncConflict };
        await updateBook(merged);
        booksRef.current = booksRef.current.map(book => book.id === updated.id ? merged : book);
        setBooks(booksRef.current);
        if (updated.progressSyncConflict || updated.reviewSyncConflict) {
          setLastSyncError('The cloud record changed again. Both versions are preserved for another choice.');
        } else setNotice('Private ' + (kind === 'review' ? 'notes' : 'reading position') + ' conflict resolved.');
      }
    } catch (reason) {
      setError('Could not resolve the conflict; local data has been kept: ' + String(reason));
    } finally {
      setCloudBusy(false);
    }
  }, [cloudRepo, cloudSession, cloudBusy, collectionsConflict, applyCollectionsOutcome, confirm]);

  const syncConflicts: Array<{
    kind: 'progress' | 'review' | 'collections'; bookId?: string; title: string; detail: string;
    localText?: string; remoteText?: string;
  }> = [];
  for (const book of books) {
    if (book.progressSyncConflict) {
      const remote = book.progressSyncConflict.value;
      syncConflicts.push({ kind: 'progress', bookId: book.id,
        title: 'Reading position: ' + book.title,
        detail: 'This device: ' + Math.round(book.progress) + '% (chapter ' +
          (book.currentChapterNumber ?? '?') + '); cloud: ' +
          (remote ? Math.round(remote.progress) + '% (chapter ' + (remote.currentChapterNumber ?? '?') + ')' : 'no saved position') });
    }
    if (book.reviewSyncConflict) {
      const remote = book.reviewSyncConflict.value;
      syncConflicts.push({ kind: 'review', bookId: book.id,
        title: 'Rating, comments or Trying shelf: ' + book.title,
        detail: 'This device rating: ' + (book.personalRating ?? 'unrated') +
          '/10; cloud rating: ' + (remote?.rating ?? 'unrated') + '/10. ' +
          'This device shelf: ' + (book.shelfStatus === 'trying' ? 'Trying' : 'Regular') +
          '; cloud shelf: ' + (remote?.shelfStatus === 'trying' ? 'Trying' : 'Regular') + '.',
        localText: book.personalReview || '(no comments)',
        remoteText: remote?.comments || '(no comments)' });
    }
  }
  if (collectionsConflict) {
    syncConflicts.push({ kind: 'collections', title: 'Reading collections',
      detail: 'This device: ' + collections.length + ' saved collections; cloud: ' +
        collectionsConflict.remote.length + '. Compare the names and memberships below.',
      localText: collections.map(item => (item.deleted ? '[Deleted] ' : '') + item.name + ': ' +
        item.bookIds.map(id => books.find(book => book.id === id)?.title || id).join(', ')).join('\n') || '(none)',
      remoteText: collectionsConflict.remote.map(item => (item.deleted ? '[Deleted] ' : '') + item.name +
        ': ' + item.bookIds.map(id => books.find(book => book.id === id)?.title || id).join(', ')).join('\n') || '(none)' });
  }

  function pickerChanged(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) void importFiles(event.target.files);
    event.target.value = '';
  }
  const activeBook = books.find(book => book.id === readingId);
  const detailBook = books.find(book => book.id === detailsId);
  // Keep collection membership lookup out of rating/edit state updates in BookDetails.
  // This uses the already loaded local/cloud collection metadata, never another request.
  const detailMemberships = useMemo(
    () => detailBook ? collectionMembershipPaths(collections, detailBook.id) : [],
    [collections, detailBook?.id],
  );
  const { library: visibleLibraryBooks, localBackups } = useMemo(() => partitionLocalBackups(books), [books]);
  const libraryReady = localLoaded && oauthChecked && (!cloudSession || initialCloudLoaded);
  // A numeric reader deep link takes priority over any saved CFI position.
  // Current chapter changes are written with replaceState, so routine
  // scrolling never floods the browser history with hundreds of entries.
  const currentRoute = parseLibraryRoute(window.location.pathname);
  const requestedChapter = currentRoute.page === 'reader' ? currentRoute.chapter : undefined;
  return <>
    {!libraryReady ? (
      <main className={`library-bootstrap theme-${settings.theme}`} role="status" aria-live="polite">
        <div className="library-bootstrap-mark" aria-hidden="true">✦</div>
        <strong>Taiyou's Novel Library</strong>
        <span>{cloudSession ? 'Checking your private catalogue…' : 'Opening your library…'}</span>
      </main>
    ) : activeBook && readerFile?.id !== activeBook.id ? (
      <div className={`reader-route-loading theme-${settings.theme}`} role="status">
        {error || `Preparing “${activeBook.title}” for reading…`}
        <button type="button" onClick={goLibrary}>Return to library</button>
      </div>
    ) : activeBook ? (
      <Suspense fallback={<main className="reader-route-loading" role="status">Opening your reader…</main>}>
      <Reader key={activeBook.id} book={activeBook} epub={readerFile!.epub} settings={settings} onSettings={setSettings}
        initialChapterHref={startChapterHref || undefined}
        initialChapterNumber={requestedChapter}
        onChapterChange={chapter => {
          const current = parseLibraryRoute(window.location.pathname);
          const currentBook = resolveNovelRoute(current, booksRef.current);
          if (current.page !== 'reader' || currentBook?.id !== activeBook.id) return;
          const chapterUrl = namedNovelUrl(activeBook, booksRef.current, true, chapter);
          if (window.location.pathname !== chapterUrl) {
            window.history.replaceState(window.history.state, '', chapterUrl + window.location.search + window.location.hash);
          }
        }}
        onBack={goLibrary} collections={collections.filter(c => !c.deleted)} onBrowseLibrary={browseLibraryFromNovel}
        onNovelDetails={() => { setReadingId(null); setDetailsId(activeBook.id); setStartChapterHref(null); navigate(namedNovelUrl(activeBook, booksRef.current)); }} onProgress={recordProgress} />
      </Suspense>
    ) : detailBook ? (
      <BookDetails book={detailBook} availableTags={tagCounts(books).map(({tag}) => tag)} theme={settings.theme} onThemeChange={theme => setSettings(current => ({ ...current, theme }))}
        collections={collections.filter(c => !c.deleted)} membershipPaths={detailMemberships} onBrowseLibrary={browseLibraryFromNovel}
        onToggleCollection={(collectionId, include) => changeCollectionMembership(collectionId, detailBook.id, include)}
        onCreateCollectionForBook={(name, parentId) => createCollectionWithNovel(detailBook.id, name, parentId)}
        onLoadChapters={() => loadChapterCatalog(detailBook.id, detailBook.chapterCount, async () => {
          if (readerFileRef.current?.id === detailBook.id) return readerFileRef.current.epub;
          try { return await getBookFile(detailBook.id); }
          catch { /* Preview can read a hosted EPUB without caching it. */ }
          if (!detailBook.cloud || !cloudRepo || !cloudSession) {
            throw new Error('Connect your private library to browse this EPUB’s chapters.');
          }
          let entry = findCloudEntryForBook([...cloudEntries.current.values()], detailBook);
          if (!entry) {
            const latest = await fetchCloudCatalog(validateDatasetRepo(cloudRepo), cloudSession);
            cloudEntries.current = new Map(latest.books.map(item => [item.id, item]));
            entry = findCloudEntryForBook(latest.books, detailBook);
          }
          if (!entry) throw new Error('Novel EPUB is missing from the verified private catalogue.');
          // Deliberately omit saveBook(): only explicit Save offline and
          // direct user imports should persist EPUBs in browser IndexedDB.
          return fetchCloudEpub(cloudRepo, entry, cloudSession);
        })}
        onBack={goLibrary} onRead={() => openBook(detailBook)} readHref={namedNovelUrl(detailBook, books, true)}
        onReadChapter={href => openBook(detailBook, href)}
        onDownloadEpub={() => downloadEpub(detailBook)}
        isCachedOffline={cachedEpubIds.includes(detailBook.id)}
        onSaveOffline={() => makeAvailableOffline(detailBook)}
        onRemoveOffline={() => requestRemoveOffline(detailBook)}
        onDeleteLocal={() => removeBook(detailBook)}
        onDownloadArchive={cloudSession && findCloudEntryForBook([...cloudEntries.current.values()], detailBook)?.archivePath
          ? () => downloadArchive(detailBook) : undefined}
        cloudConnected={!!cloudSession && !!cloudRepo}
        cloudRepo={cloudRepo} cloudSession={cloudSession}
        onSaveTags={tags => savePersonalTags(detailBook.id, tags)}
        onSaveSummary={summary => savePersonalSummary(detailBook.id, summary)}
        onSaveReview={(rating, review) => savePersonalReview(detailBook.id, rating, review)}
        onSetTrial={(trying) => savePersonalReview(detailBook.id, detailBook.personalRating, detailBook.personalReview || '', trying ? 'trying' : 'regular')}
        onMarkCompleted={() => markNovelCompleted(detailBook.id)}
        onBrowseAuthor={author => { setGlobalSearch(''); setBrowseTag(''); setReadingId(null); setDetailsId(null); setStartChapterHref(null); navigate(libraryAuthorUrl(author)); }}
        onBrowseTag={tag => { setBrowseTag(tag); setGlobalSearch(''); setReadingId(null); setDetailsId(null); setStartChapterHref(null); navigate(libraryTagUrl(tag)); }} error={error} />
    ) : (
      <LibraryDashboard books={visibleLibraryBooks} localBackups={localBackups} theme={settings.theme}
        cachedEpubIds={cachedEpubIds} online={online} offlineShellReady={offlineShellReady}
        bulkOfflineProgress={bulkOfflineProgress} onCacheAllOffline={() => void saveAllOffline()}
        offlineRetention={offlineRetention}
        pendingReviewCount={books.filter(book => book.pendingReviewSync).length}
        pendingProgressCount={books.filter(book => book.pendingProgressSync).length}
        collectionsSyncPending={collectionsSyncPending}
        syncConflicts={syncConflicts} onResolveSyncConflict={resolveSyncConflict}
        collections={collections.filter(c => !c.deleted)}
        onCreateCollection={createCollection}
        onMoveCollection={changeCollectionParent}
        onRenameCollection={renameCollection}
        onDeleteCollection={requestDeleteCollection}
        onCollectionMembership={changeCollectionMembership}
        initialTag={browseTag} libraryPath={routePath} onLibraryNavigate={navigate} globalSearch={globalSearch} onGlobalSearch={setGlobalSearch}
        onThemeChange={theme => setSettings(settings => ({ ...settings, theme }))}
        onImportClick={() => filePicker.current?.click()}
        onFiles={files => void importFiles(files)} onOpen={showDetails}
        onRead={openBook} onRemoveOffline={requestRemoveOffline}
        allBooks={books} onMasterClearOffline={masterClearOffline}
        onMasterSaveRating={masterSaveRating} onMasterCorrectMetadata={masterCorrectMetadata}
        onMasterCorrectPublicationStatus={masterCorrectPublicationStatus}
        onMasterMarkCompleted={masterMarkCompleted} onMasterResetProgress={masterResetProgress}
        onMasterSaveTags={masterSaveTags} onMasterSaveSummary={masterSaveSummary}
        onMasterSaveReview={masterSaveReview} onMasterExportEpub={masterExportEpub}
        onMasterDeleteNovel={masterDeleteNovel} staleCount={staleCount}
        onMasterArchiveStale={masterArchiveStale}
        importing={importing || !!loadingBook} notice={notice} onDismissNotice={() => setNotice(null)} error={error} storageError={storageError}
        cloudRepo={cloudRepo} cloudSession={cloudSession} cloudBusy={cloudBusy}
        cloudMessage={loadingBook ? `Opening ${loadingBook}…` : cloudMessage}
        syncProblem={lastSyncError}
        onCloudRepo={saveCloudRepository} onCloudLogin={signInToCloud}
        onCloudLogout={signOutOfCloud} onCloudRefresh={() => void refreshCloud()}
        onCloudPublishCached={publishCachedNovels} />
    )}
    {collectionToasts.length > 0 && <div className="collection-toast-stack" aria-label="Recent collection updates">
      {collectionToasts.map(toast => <CollectionToast key={toast.id} toast={toast}
        onDismiss={() => setCollectionToasts(current => current.filter(item => item.id !== toast.id))} />)}
    </div>}
    {!readingId && <BackToTop theme={settings.theme} />}
    {ownerRequest && <OwnerActionDialog theme={settings.theme} request={ownerRequest}
      initialBackupExported={ownerRequest.fromMaster === true && masterExportedEpubs.current.has(ownerRequest.id)}
      onExportBackup={masterExportEpub}
      onCancel={() => setOwnerRequest(null)} onConfirm={performOwnerAction} />}
    <input ref={filePicker} type="file" accept=".epub,.zip,application/epub+zip" multiple hidden
      onChange={pickerChanged} aria-label="Import EPUB or Novel ZIP" />
  </>;
}
