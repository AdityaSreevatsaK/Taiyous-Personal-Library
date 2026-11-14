import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import AdvancedSearch from './AdvancedSearch';
import EditorialHome from './EditorialHome';
import { useCoverArt } from './useCoverArt';
import {
  ArrowRight, Book, BookOpen, CheckCircle2, ChevronDown, CloudOff, Download, WifiOff,
  Feather, Hash, Library, LockKeyhole, Moon, Pencil, Plus, Search, Settings2,
  Sparkles, Star, Sun, Tag, Trash2, Upload, X, Cloud, RefreshCw, LogIn, LogOut,
} from 'lucide-react';
import type { LibraryBook, ReaderTheme } from '../types';
import { bookTags, includesTag, tagCounts } from '../lib/tags';
import type { CloudSession } from '../lib/cloud';
import type { BookCollection } from '../lib/collections';

type Filter = 'all' | 'trying' | 'reading' | 'unread' | 'finished' | 'offline';
type Sort = 'recent' | 'title' | 'added';

interface Props {
  books: LibraryBook[];
  cachedEpubIds: string[];
  online: boolean;
  offlineShellReady: boolean;
  bulkOfflineProgress: { done: number; total: number } | null;
  offlineRetention: 'persistent' | 'best-effort' | 'unknown';
  onCacheAllOffline: () => void;
  pendingReviewCount: number;
  pendingProgressCount: number;
  collectionsSyncPending: boolean;
  collections: BookCollection[];
  onCreateCollection: (name: string) => Promise<void>;
  onRenameCollection: (id: string, name: string) => Promise<void>;
  onDeleteCollection: (id: string) => void;
  onCollectionMembership: (collectionId: string, bookId: string, include: boolean) => Promise<void>;
  initialTag: string;
  globalSearch: string;
  onGlobalSearch: (query: string) => void;
  theme: ReaderTheme;
  onThemeChange: (theme: ReaderTheme) => void;
  onImportClick: () => void;
  onFiles: (files: FileList | File[]) => void;
  onOpen: (book: LibraryBook) => void;
  onRead: (book: LibraryBook) => void;
  onRemoveOffline: (book: LibraryBook) => void;
  importing: boolean;
  notice: string | null;
  error: string | null;
  storageError: string | null;
  cloudRepo: string;
  cloudSession: CloudSession | null;
  cloudBusy: boolean;
  cloudMessage: string | null;
  syncProblem: string | null;
  onCloudRepo: (repo: string) => void;
  onCloudLogin: (token: string) => void;
  onCloudLogout: () => void;
  onCloudRefresh: () => void;
  onCloudPublishCached: () => void;
}

const themes: ReaderTheme[] = ['light', 'dark', 'sepia'];

export function Cover({ book, variant = 'normal', cloudRepo = '', cloudSession = null }: {
  book: LibraryBook;
  variant?: 'normal' | 'feature';
  cloudRepo?: string;
  cloudSession?: CloudSession | null;
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(variant === 'feature');
  useEffect(() => {
    if (visible || !book.coverPath) return;
    const element = wrapper.current;
    if (!element || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const watcher = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        watcher.disconnect();
      }
    }, { rootMargin: '360px' });
    watcher.observe(element);
    return () => watcher.disconnect();
  }, [book.id, book.coverPath, visible]);
  const imageUrl = useCoverArt(book, cloudRepo, cloudSession, visible);
  const [failedImage, setFailedImage] = useState(false);
  useEffect(() => setFailedImage(false), [book.id, book.coverPath]);
  const visibleImage = failedImage ? null : imageUrl;
  const coverNumber = parseInt(book.id.slice(0, 2), 16) % 6;
  return (
    <div ref={wrapper} className={`cover cover-${coverNumber} ${variant === 'feature' ? 'cover-feature' : ''} ${visibleImage ? 'cover-has-image' : ''}`} aria-hidden="true">
      {visibleImage && <img className="cover-art" src={visibleImage} alt="" decoding="async" loading={variant === 'feature' ? 'eager' : 'lazy'} onError={() => setFailedImage(true)} />}
      <div className="cover-ornament top-ornament">✦</div>
      <div className="cover-lilies"><span>❧</span></div>
      <div className="cover-heading">{book.title}</div>
      <div className="cover-author">{book.author}</div>
      <div className="cover-bottom"><span>TAIYOU'S LIBRARY</span><span>✦</span></div>
    </div>
  );
}

export default function LibraryDashboard({
  books, cachedEpubIds, online, offlineShellReady, bulkOfflineProgress, onCacheAllOffline, offlineRetention, pendingReviewCount, pendingProgressCount, collectionsSyncPending,
  collections, onCreateCollection, onRenameCollection, onDeleteCollection, onCollectionMembership,
  initialTag, globalSearch, onGlobalSearch, theme, onThemeChange, onImportClick, onFiles, onOpen, onRead, onRemoveOffline,
  importing, notice, error, storageError, cloudRepo, cloudSession,
  cloudBusy, cloudMessage, syncProblem, onCloudRepo, onCloudLogin, onCloudLogout, onCloudRefresh, onCloudPublishCached,
}: Props) {
  const [filter, setFilter] = useState<Filter>(online ? 'all' : 'offline');
  const [showAdvanced, setShowAdvanced] = useState(false);
  useEffect(() => {
    if (!online) {
      setShowAdvanced(false);
      setFilter('offline');
      setSelectedTag('');
      setSelectedCollectionId('');
      setQuery('');
      onGlobalSearch('');
    }
  }, [online, onGlobalSearch]);
  const [sort, setSort] = useState<Sort>('title');
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState(initialTag);
  const [selectedCollectionId, setSelectedCollectionId] = useState('');
  useEffect(() => {
    if (selectedCollectionId && !collections.some(item => item.id === selectedCollectionId)) setSelectedCollectionId('');
  }, [collections, selectedCollectionId]);
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const availableTags = useMemo(() => tagCounts(books), [books]);
  const [repoDraft, setRepoDraft] = useState(cloudRepo);
  const [showCloud, setShowCloud] = useState(false);
  const cloudRoot = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!showCloud) return;
    const closeOutside = (event: PointerEvent) => {
      if (!cloudRoot.current?.contains(event.target as Node)) setShowCloud(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowCloud(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [showCloud]);
  const [datasetToken, setDatasetToken] = useState('');
  const [dragging, setDragging] = useState(false);
  const reading = books.filter((book) => book.shelfStatus !== 'trying' && book.progress > 0 && book.progress < 99.5);
  const finished = books.filter((book) => book.shelfStatus !== 'trying' && book.progress >= 99.5);
  const featured = [...reading].sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0))[0] || books[0];

  const globalMode = globalSearch.trim().length > 0;
  const selectedCollection = collections.find(c => c.id === selectedCollectionId);
  const showEditorialHome = books.length > 0 && filter === 'all' && !selectedTag && !selectedCollectionId && !globalMode && !showAdvanced;
  const visible = useMemo(() => {
    const q = (globalMode ? globalSearch : query).trim().toLocaleLowerCase();
    return books.filter((book) => {
      // Global search always spans the entire library; local search stays scoped.
      if (!globalMode) {
        if (filter === 'offline' && !cachedEpubIds.includes(book.id)) return false;
         if (filter === 'trying' && book.shelfStatus !== 'trying') return false;
         if (filter !== 'all' && filter !== 'offline' && filter !== 'trying' && book.shelfStatus === 'trying') return false;
        if (filter === 'reading' && !(book.progress > 0 && book.progress < 99.5)) return false;
        if (filter === 'finished' && book.progress < 99.5) return false;
        if (filter === 'unread' && book.progress > 0) return false;
        if (selectedTag && !includesTag(book, selectedTag)) return false;
        if (selectedCollection && !selectedCollection.bookIds.includes(book.id)) return false;
      }
      return !q || `${book.title} ${book.author} ${bookTags(book).join(' ')}`.toLocaleLowerCase().includes(q);
    }).sort((a, b) => globalMode || selectedTag || selectedCollection || sort === 'title'
      ? a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }) : sort === 'added' ? b.importedAt - a.importedAt
      : (b.lastOpenedAt ?? b.importedAt) - (a.lastOpenedAt ?? a.importedAt));
  }, [books, filter, sort, query, selectedTag, selectedCollection, globalSearch, globalMode, cachedEpubIds]);
  function browseTag(tag: string) {
    setShowAdvanced(false);
    setSelectedTag(tag);
    setSelectedCollectionId('');
    setQuery('');
    setFilter('all');
    onGlobalSearch('');
  }
  function clearTag() { setSelectedTag(''); setQuery(''); }
  function browseCollection(id: string) { setShowAdvanced(false); setSelectedCollectionId(id); setSelectedTag(''); setFilter('all'); setQuery(''); onGlobalSearch(''); }
  function clearCollection() { setSelectedCollectionId(''); setQuery(''); }


  function drop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) onFiles(event.dataTransfer.files);
  }
  function over(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(true);
  }
  function leave(event: DragEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
  }
  function goTo(newFilter: Filter) { setShowAdvanced(false); setFilter(newFilter); clearTag(); clearCollection(); onGlobalSearch(''); }


  const navEntries = [
    { id: 'all' as Filter, name: 'All books', count: books.length, icon: Library },
    { id: 'trying' as Filter, name: 'Trying out', count: books.filter(b => b.shelfStatus === 'trying').length, icon: Sparkles },
     { id: 'reading' as Filter, name: 'Currently reading', count: reading.length, icon: BookOpen },
    { id: 'unread' as Filter, name: 'To be read', count: books.filter((b) => b.shelfStatus !== 'trying' && b.progress === 0).length, icon: Book },
    { id: 'finished' as Filter, name: 'Finished', count: finished.length, icon: CheckCircle2 },
    { id: 'offline' as Filter, name: 'Available offline', count: cachedEpubIds.length, icon: Download },
  ];

  return (
    <div className={`app-shell theme-${theme} ${import.meta.env.VITE_DESIGN_PREVIEW === 'true' ? 'static-hybrid-preview' : ''}`} onDragOver={over} onDrop={drop} onDragLeave={leave}>
      {dragging && <div className="drop-overlay" aria-hidden="true"><Upload size={46} /><strong>Drop your novels to import</strong><span>EPUB or supported Novel ZIP</span></div>}

      <main className="main-panel">
        <header className="topbar"><button className="library-wordmark" type="button" aria-label="Taiyou's Personal Library home" onClick={() => goTo('all')}><span className="library-wordmark-mark"><Feather size={20}/></span><span className="library-wordmark-text"><strong>TAIYOU</strong><small>PERSONAL LIBRARY</small></span></button><section className="cloud-connect" aria-label="Cloud library storage" ref={cloudRoot}>
            <div className="cloud-connect-head"><span><Cloud size={16} /><strong>Cloud library</strong><small className={syncProblem ? 'connection-badge needs-attention' : cloudRepo && cloudSession ? 'connection-badge is-connected' : 'connection-badge'}>{syncProblem ? 'Needs sync' : cloudRepo && cloudSession ? 'Connected' : cloudRepo ? 'Disconnected' : 'Not set up'}</small></span>{!cloudSession && online && <button type="button" className="secondary-button oauth-header-login" onClick={() => window.location.assign('/api/oauth/login')}><LogIn size={14}/> Sign in with HF</button>}<button type="button" className="secondary-button" aria-expanded={showCloud} onClick={() => setShowCloud(v => !v)}>{showCloud ? 'Close' : 'Settings'}</button></div>
            {showCloud && <div className="cloud-connect-body">
              <p>Use one private Hugging Face dataset as the shared <code>data/</code> folder on PC and mobile. When connected, importing a ZIP saves its original archive, EPUB and catalogue to that repository.</p>
              {cloudSession?.via === 'oauth' ? <p className="cloud-access-connected"><LockKeyhole size={15}/> Signed in with Hugging Face. Your private dataset token is kept in an encrypted server-side session cookie, not saved by this page.</p> : <form onSubmit={event => {event.preventDefault(); onCloudRepo(repoDraft); }} className="cloud-repo-form"><label htmlFor="cloud-repo-input">Private dataset repository</label><input id="cloud-repo-input" value={repoDraft} onChange={event => setRepoDraft(event.target.value)} placeholder="your-username/taiyous-novels" autoComplete="off" /><button type="submit" className="secondary-button">Save</button></form>}
              <div className="cloud-actions">
                {cloudSession ? <><button type="button" className="secondary-button" disabled={!cloudRepo || cloudBusy} onClick={onCloudRefresh}><RefreshCw size={16}/>{cloudBusy ? 'Refreshing…' : 'Refresh cloud'}</button><button type="button" className="secondary-button" disabled={cloudBusy || !books.some(book => !book.cloud)} onClick={onCloudPublishCached}><Upload size={16}/> Publish cached EPUBs ({books.filter(book => !book.cloud).length})</button><button type="button" className="secondary-button" onClick={onCloudLogout}><LogOut size={16}/> {cloudSession.via === 'oauth' ? 'Sign out' : 'Disconnect'}</button></> : <div className="oauth-login-options">
                  <button type="button" className="primary-button" disabled={!online}
                    onClick={() => window.location.assign('/api/oauth/login')}>
                    <LogIn size={17}/> Sign in with Hugging Face
                  </button>
                  <p>Sign in once with your HF account. The connection is restored automatically on reload until the OAuth session expires.</p>
                  <details className="legacy-token-login">
                    <summary>Use a dataset token instead (fallback)</summary>
                    <form className="cloud-token-form" onSubmit={event => {
                    event.preventDefault();
                    if (!datasetToken.trim()) return;
                    onCloudLogin(datasetToken);
                    setDatasetToken('');
                  }}>
                  <label htmlFor="cloud-token-input">Dataset access token</label>
                  <input id="cloud-token-input" type="password" value={datasetToken}
                    onChange={event => setDatasetToken(event.target.value)}
                    placeholder="Paste Taiyou-Novels-Storage token" autoComplete="off" spellCheck={false}
                    aria-describedby="cloud-token-note" />
                  <button type="submit" className="primary-button" disabled={!cloudRepo || !datasetToken.trim() || cloudBusy}>
                    <LogIn size={16}/> Connect private dataset
                  </button>
                    </form>
                  </details>
                </div>}
              </div>
              {syncProblem && <p className="cloud-sync-warning" role="status">{syncProblem}</p>}
              {cloudMessage && <p className="cloud-sync-message" role="status">{cloudMessage}</p>}
              {cloudSession?.via !== 'oauth' && <p className="cloud-caution" id="cloud-token-note">Legacy manual connection: use only a fine-grained dataset token. It is held in memory only and not retained after restarting the app. The Hugging Face OAuth sign-in is preferred, so you need not re-enter a token on every visit.</p>}
            </div>}
          </section><div className="top-actions"><label className="global-search-field"><Search size={16} /><input aria-label="Search all novels" placeholder="Search all novels…" value={globalSearch} onChange={event => onGlobalSearch(event.target.value)} />{globalSearch && <button type="button" aria-label="Clear global search" onClick={() => onGlobalSearch('')}><X size={15} /></button>}</label><button type="button" className="advanced-search-launch" onClick={() => { setShowAdvanced(true); }}><Search size={16} /><span>Advanced search</span></button><button className="icon-button theme-switch" onClick={() => onThemeChange(themes[(themes.indexOf(theme) + 1) % themes.length])} title="Change theme" aria-label="Change theme">{theme === 'dark' ? <Moon size={19} /> : <Sun size={19} />}</button></div></header>
        <nav className="primary-top-nav" aria-label="Library sections">
          <div className="top-nav-links">
            {navEntries.map(({ id, name, count }) => <button type="button" key={id} className={`top-nav-link ${!showAdvanced && filter === id && !selectedTag && !selectedCollectionId ? 'active' : ''}`}
              aria-current={!showAdvanced && filter === id && !selectedTag && !selectedCollectionId ? 'page' : undefined}
              onClick={() => goTo(id)}><span>{name}</span><small>{count}</small></button>)}
          </div>
          <div className="top-nav-tools">
            <details className="top-nav-menu" aria-label="Novel tags">
              <summary><Hash size={15}/> Tags <ChevronDown size={13}/></summary>
              <div className="top-nav-dropdown" role="group" aria-label="Browse tags">
                <strong className="top-nav-caption">BROWSE BY TAG</strong>
                {availableTags.length > 0 ? availableTags.map(({ tag, count }) =>
                  <button type="button" key={tag} className="top-nav-dropdown-item" aria-label={`Browse novels tagged ${tag}`}
                    onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); browseTag(tag); }}>
                    <span>{tag}</span><small>{count}</small></button>)
                  : <p className="top-nav-empty">No tags yet</p>}
              </div>
            </details>
            <details className="top-nav-menu" aria-label="Novel collections">
              <summary><Library size={15}/> Collections <ChevronDown size={13}/></summary>
              <div className="top-nav-dropdown" role="group" aria-label="Manage collections">
                <strong className="top-nav-caption">YOUR COLLECTIONS</strong>
                {collections.map(collection => <button type="button" key={collection.id} className="top-nav-dropdown-item"
                    aria-label={`Open collection ${collection.name}`} onClick={event => {
                      event.currentTarget.closest('details')?.removeAttribute('open'); browseCollection(collection.id);
                    }}><span>{collection.name}</span><small>{collection.bookIds.length}</small></button>)}
                {collections.length === 0 && <p className="top-nav-empty">No collections yet</p>}
                <button type="button" className="top-nav-new-collection" aria-label="Create collection"
                  onClick={() => setCreatingCollection(value => !value)}><Plus size={14}/> New collection</button>
                {creatingCollection && <form className="top-nav-collection-form" onSubmit={event => {
                  event.preventDefault();
                  if (!newCollectionName.trim()) return;
                  void onCreateCollection(newCollectionName).then(() => {
                    setNewCollectionName(''); setCreatingCollection(false);
                  });
                }}>
                  <label htmlFor="collection-name-input">Collection name</label>
                  <input id="collection-name-input" maxLength={90} value={newCollectionName}
                    onChange={event => setNewCollectionName(event.target.value)} placeholder="e.g. Favourite series" required />
                  <button type="submit" aria-label="Save new collection"><CheckCircle2 size={17}/> Save</button>
                </form>}
              </div>
            </details>
            <button type="button" className="top-nav-add" onClick={onImportClick} disabled={importing}>
              <Plus size={16}/><span>{importing ? 'Importing…' : 'Add novel'}</span>
            </button>
          </div>
        </nav>
        <div className="page-content">
          {import.meta.env.VITE_DESIGN_PREVIEW === 'true' && <div className="hybrid-demo-notice" role="note">
            <strong>DESIGN PREVIEW</strong> Fictional novels and sample chapters only. This separate site cannot access your private Hugging Face library.
          </div>}
          {notice && <div className="alert success-alert" role="status"><CheckCircle2 size={17} />{notice}</div>}
          {(error || storageError) && <div className="alert error-alert" role="alert">{error || storageError}</div>}
          {!showAdvanced && !showEditorialHome && <div className="page-head page-head-compact">
            <div><div className="eyebrow"><span className="eyebrow-line" /> TAIYOU'S COLLECTION</div>
              <h1>{filter === 'offline' ? 'Offline library' : filter === 'trying' ? 'Trying out' : selectedCollection ? selectedCollection.name : selectedTag ? selectedTag : 'Your library'}<span className="serif-accent">.</span></h1>
              <p>{filter === 'offline' ? `${cachedEpubIds.length} downloaded for reading without a connection` : filter === 'trying' ? `${books.filter(b => b.shelfStatus === 'trying').length} novels to sample before deciding` : `${books.length} stories to explore, all in one place`}</p>
            </div>
            <button className="primary-button desktop-import" onClick={onImportClick} disabled={importing}><Plus size={18}/>{importing ? 'Importing…' : 'Add a novel'}</button>
          </div>}
          {!showAdvanced && filter === 'offline' && <section className="offline-health offline-management-bar" aria-label="Offline downloads">
             <span className={online ? 'offline-connection online' : 'offline-connection offline'}>
               {online ? <Cloud size={14} /> : <WifiOff size={14} />}{online ? 'Online' : 'Offline'}
             </span>
             <span><Download size={14} /> {cachedEpubIds.filter(id => books.some(book => book.id === id)).length} downloaded EPUBs on this device</span>
             {cachedEpubIds.length < books.length && books.length > 0 && <button type="button" className="offline-cache-all-btn"
               onClick={onCacheAllOffline} disabled={!online || !!bulkOfflineProgress}
               aria-label="Save all novels for offline reading"><Download size={13} />
               {bulkOfflineProgress ? `Saving ${bulkOfflineProgress.done} of ${bulkOfflineProgress.total}…` : 'Save all offline'}
             </button>}
             <span>{offlineShellReady ? 'App ready for offline reading' : 'Offline app assets not yet ready'}</span>
             {cachedEpubIds.length > 0 && <span title="Browser storage can be cleared manually or by the device">
               {offlineRetention === 'persistent' ? 'Persistent browser storage granted'
                 : offlineRetention === 'best-effort' ? 'Best-effort cache; keep a backup'
                   : 'Offline copies are browser-managed; keep a backup'}
             </span>}
             {pendingReviewCount > 0 && <span className="pending-sync-status">{pendingReviewCount} notes waiting to sync</span>}
             {pendingProgressCount > 0 && <span className="pending-sync-status">{pendingProgressCount} reading positions waiting to sync</span>}
             {collectionsSyncPending && <span className="pending-sync-status">Collections waiting to sync</span>}
           </section>}
                    {showAdvanced ? <AdvancedSearch books={books} offlineIds={cachedEpubIds} initialName={globalSearch} cloudRepo={cloudRepo} cloudSession={cloudSession}
            onClose={() => { setShowAdvanced(false); onGlobalSearch(''); }} onOpen={onOpen}
            onBrowseTag={browseTag} /> : <>

          {showEditorialHome && <EditorialHome books={books} onOpen={onOpen} onRead={onRead} onBrowseTag={browseTag}
            cover={(book, isFeatured) => <Cover book={book} variant={isFeatured ? 'feature' : 'normal'} cloudRepo={cloudRepo} cloudSession={cloudSession} />} />}

          {!showEditorialHome && reading.length > 0 && featured && (
            <section className="reading-resume-strip" aria-label="Continue reading">
              <div className="reading-resume-icon"><BookOpen size={20}/></div>
              <div className="reading-resume-info"><span>CONTINUE READING</span>
                <button type="button" onClick={() => onOpen(featured)}>{featured.title}</button>
                <small>{Math.round(featured.progress)}% completed{featured.currentChapter ? ` · ${featured.currentChapter}` : ''}</small>
              </div>
              <button className="reading-resume-continue" type="button" onClick={() => onRead(featured)}>
                Open book <ArrowRight size={16}/>
              </button>
            </section>
          )}

          <section id="library-full-catalogue" className="library-section" aria-label="Book collection"><div className={`section-titlebar ${!globalMode && !selectedTag && !selectedCollection && (filter === 'all' || filter === 'offline') ? 'section-titlebar-quiet' : '' }`}><div><div className="section-overline">{globalMode ? 'ALL NOVELS' : selectedCollection ? 'YOUR COLLECTION' : selectedTag ? 'BROWSING TAG' : 'THE COLLECTION'}</div><h2>{globalMode ? 'Global search results' : selectedCollection ? selectedCollection.name : selectedTag ? selectedTag : filter === 'all' ? 'All your stories' : navEntries.find((i) => i.id === filter)?.name}<span className="title-count">{visible.length}</span></h2></div><span className="library-description">A little world on every shelf</span></div>
            {selectedTag && !globalMode && <div className="tag-collection-head"><span>Novels tagged <strong>{selectedTag}</strong> · Sorted A–Z</span><button type="button" onClick={clearTag}>Show all novels <X size={13} /></button></div>}{selectedCollection && !globalMode && <div className="tag-collection-head collection-heading">
              <span><strong>{selectedCollection.name}</strong> · {visible.length} novels · Sorted A–Z</span>
              <div className="collection-actions">
                <button type="button" onClick={() => {
                  const value = window.prompt('Rename collection', selectedCollection.name);
                  if (value?.trim()) void onRenameCollection(selectedCollection.id, value);
                }}><Pencil size={13} /> Rename</button>
                <button type="button" onClick={() => {
                  onDeleteCollection(selectedCollection.id);
                }}><Trash2 size={13} /> Delete</button>
                <button type="button" onClick={clearCollection}>All novels <X size={13} /></button>
              </div>
            </div>}<div className="library-toolbar"><div className="filter-tabs">{(['all', 'trying', 'reading', 'unread', 'finished', 'offline'] as Filter[]).map((name) => <button key={name} onClick={() => { setFilter(name); onGlobalSearch(''); }} className={filter === name ? 'selected' : ''}>{name === 'all' ? 'All' : name === 'trying' ? 'Trying' : name === 'reading' ? 'Reading' : name === 'unread' ? 'Unread' : name === 'offline' ? 'Offline' : 'Finished'}</button>)}</div><div className="toolbar-right"><label className="tag-filter"><Tag size={16} /><select aria-label="Filter novels by tag" value={selectedTag} onChange={(e) => browseTag(e.target.value)}><option value="">All tags</option>{availableTags.map(({tag, count}) => <option key={tag} value={tag}>{tag} ({count})</option>)}</select><ChevronDown size={14} /></label><label className="search-field"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={selectedCollection ? `Search ${selectedCollection.name}…` : selectedTag ? `Search ${selectedTag} novels…` : "Search this shelf…"} aria-label="Search within current list" />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>}</label><label className="sort-field"><Settings2 size={16} /><select value={selectedTag || selectedCollection || globalMode ? 'title' : sort} disabled={!!selectedTag || !!selectedCollection || globalMode} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort books"><option value="title">Title A–Z</option><option value="recent">Recent</option><option value="added">Date added</option></select><ChevronDown size={14} /></label></div></div>

            {visible.length ? <div className="book-grid">{visible.map((book) => <article className="book-tile" key={book.id}><button className="cover-button" onClick={() => onOpen(book)} aria-label={`View details for ${book.title}`}><Cover book={book} cloudRepo={cloudRepo} cloudSession={cloudSession} /></button><div className="tile-meta"><div className="tile-title-row"><button className="tile-title" onClick={() => onOpen(book)} title={book.title}>{book.title}</button></div><p>{book.author}</p>{filter === 'offline' && cachedEpubIds.includes(book.id) && <div className="offline-tile-actions">
                {book.cloud
                  ? <button type="button" className="offline-remove-button" onClick={() => onRemoveOffline(book)} aria-label={`Remove offline EPUB for ${book.title}`}>
                      <Trash2 size={14} /> Remove download
                    </button>
                  : <span className="offline-local-only">Local-only EPUB · keep a backup</span>}
              </div>}
              {book.shelfStatus === 'trying' && <span className="trying-book-label">Trying out</span>}
               {bookTags(book).length > 0 && <div className="tile-tags">{bookTags(book).slice(0, 3).map((tag) => <button type="button" key={tag} onClick={() => browseTag(tag)} aria-label={`Browse novels tagged ${tag}`}>{tag}</button>)}{bookTags(book).length > 3 && <span>+{bookTags(book).length - 3}</span>}</div>}{collections.length > 0 && <div className="book-collection-tools">
              <label className="sr-only" htmlFor={`collection-add-${book.id}`}>Add {book.title} to collection</label>
              <select id={`collection-add-${book.id}`} aria-label={`Add ${book.title} to collection`} value="" onChange={event => {
                if (event.target.value) void onCollectionMembership(event.target.value, book.id, true);
              }}>
                <option value="">+ Add to collection…</option>
                {collections.filter(c => !c.bookIds.includes(book.id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {selectedCollection?.bookIds.includes(book.id) && <button type="button" onClick={() => void onCollectionMembership(selectedCollection.id, book.id, false)} aria-label={`Remove ${book.title} from collection`}>Remove from this collection</button>}
            </div>}<div className="tile-bottom">{book.personalRating && <span className="book-rating-pill"><Star size={12} fill="currentColor" /> {book.personalRating}/10</span>}{book.progress > 0 ? <><div className="mini-progress"><i style={{ width: `${book.progress}%` }} /></div><span>{Math.round(book.progress)}%</span></> : <span className="unread-label">NOT STARTED</span>}</div></div></article>)}</div> : <div className="no-results"><BookOpen size={27} /><h3>{filter === 'offline' ? 'No novels saved offline' : books.length ? 'No novels on this shelf' : 'Your library is waiting'}</h3><p>{filter === 'offline' ? 'While connected, choose Save offline on a novel to make it available here.' : books.length ? 'Try a different search or tag.' : 'Import a novel ZIP, then connect your private cloud dataset to use the same collection on other devices.'}</p>{!books.length && <button className="secondary-button" onClick={onImportClick}><Upload size={17} /> Choose a ZIP or EPUB</button>}</div>}
            <div className="collection-footer"><span><CloudOff size={15} /> {cloudSession && cloudRepo ? 'Novel archives upload to your private dataset' : 'Novels imported locally until cloud is connected'}</span><span>{books.length} {books.length === 1 ? 'book' : 'books'} in your private collection</span></div>
          </section>
          <button className="mobile-fab" onClick={onImportClick} aria-label="Add a novel"><Plus size={24} /></button>
          </>}
        </div>
      </main>
    </div>
  );
}
