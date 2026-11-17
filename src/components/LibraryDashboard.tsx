import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import AdvancedSearch from './AdvancedSearch';
import EditorialHome from './EditorialHome';
import ThemeSwitcher from './ThemeSwitcher';
import BrandMark from './BrandMark';
import UsageDashboard from './UsageDashboard';
import MasterControls from './MasterControls';
import './top-navigation.css';
import { useCoverArt } from './useCoverArt';
import { generatedCoverVariant } from '../lib/novel-hero';
import './site-footer.css';
import {
  BarChart3, Book, BookOpen, CheckCircle2, ChevronDown, CloudOff, Download, WifiOff,
  Hash, Library, LockKeyhole, Pencil, Plus, Search, Settings2,
  Sparkles, Star, Tag, Trash2, Upload, X, Cloud, RefreshCw, LogIn, LogOut,
} from 'lucide-react';
import type { LibraryBook, ReaderTheme } from '../types';
import { isFinished, isCurrentlyReading } from '../lib/reading-status';
import { openNovelInCurrentTab, openInternalLinkInCurrentTab } from '../lib/novel-links';
import { namedNovelUrl } from '../lib/routes';
import { bookTags, includesTag, tagCounts } from '../lib/tags';
import type { CloudSession } from '../lib/cloud';
import type { BookCollection } from '../lib/collections';
import { libraryAuthorUrl, libraryCollectionUrl, libraryShelfUrl, libraryTagUrl, parseLibraryViewPath, type ShelfFilter } from '../lib/library-routes';

type Filter = ShelfFilter;
type Sort = 'recent' | 'title' | 'added';

interface Props {
  books: LibraryBook[];
  allBooks: LibraryBook[];
  onMasterClearOffline: () => Promise<{ removed:number; kept:number }>;
  onMasterSaveRating: (id:string, rating:number|undefined) => Promise<void>;
  onMasterCorrectMetadata: (id:string, title:string, author:string) => Promise<void>;
  onMasterMarkCompleted: (id:string) => Promise<void>;
  onMasterResetProgress: (id:string) => Promise<void>;
  onMasterSaveTags: (id:string, tags:string[]) => Promise<void>;
  onMasterSaveSummary: (id:string, summary:string) => Promise<void>;
  onMasterSaveReview: (id:string, rating:number|undefined, notes:string) => Promise<void>;
  onMasterExportEpub: (id:string) => Promise<void>;
  onMasterDeleteNovel: (id:string) => Promise<void>;
  staleCount: number;
  onMasterArchiveStale: () => Promise<number>;
  /** Unique-name legacy local EPUBs remain accessible, not silently deleted. */
  localBackups: LibraryBook[];
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
  libraryPath: string;
  onLibraryNavigate: (path: string) => void;
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
  onDismissNotice: () => void;
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



export function Cover({ book, variant = 'normal', cloudRepo = '', cloudSession = null, onArtworkStateChange }: {
  book: LibraryBook;
  variant?: 'normal' | 'feature';
  cloudRepo?: string;
  cloudSession?: CloudSession | null;
  // The homepage uses this only for its floating gallery: a cover is genuine
  // once the stored image has decoded, never merely because coverPath exists.
  onArtworkStateChange?: (id: string, loaded: boolean) => void;
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
  const [imageLoaded, setImageLoaded] = useState(false);
  useEffect(() => {
    setFailedImage(false);
    setImageLoaded(false);
    onArtworkStateChange?.(book.id, false);
  }, [book.id, book.coverPath, imageUrl, onArtworkStateChange]);
  const visibleImage = failedImage ? null : imageUrl;
  const hasRealArtwork = Boolean(visibleImage && imageLoaded);
  return (
    <div ref={wrapper} className={`cover ${variant === 'feature' ? 'cover-feature' : ''} ${hasRealArtwork ? 'cover-has-image' : `cover-generated-artwork cover-${generatedCoverVariant(book.id)}`}`} aria-hidden="true">
      {visibleImage && <img className="cover-art" src={visibleImage} alt="" decoding="async" loading={variant === 'feature' ? 'eager' : 'lazy'} onLoad={() => { setImageLoaded(true); onArtworkStateChange?.(book.id, true); }} onError={() => { setFailedImage(true); setImageLoaded(false); onArtworkStateChange?.(book.id, false); }} />}
      {!hasRealArtwork && <>
        <span className="cover-ornament" aria-hidden="true">✦</span>
        <span className="cover-lilies" aria-hidden="true">❦</span>
        <span className="cover-heading">{book.title}</span>
        <span className="cover-author">{book.author}</span>
        <span className="cover-bottom"><span>TAIYOU'S LIBRARY</span><span>✧</span></span>
      </>}
    </div>
  );
}

export default function LibraryDashboard({
  books, allBooks, onMasterClearOffline, onMasterSaveRating, onMasterCorrectMetadata,
  onMasterMarkCompleted, onMasterResetProgress, onMasterSaveTags, onMasterSaveSummary,
  onMasterSaveReview, onMasterExportEpub, onMasterDeleteNovel, staleCount, onMasterArchiveStale,
  localBackups, cachedEpubIds, online, offlineShellReady, bulkOfflineProgress, onCacheAllOffline, offlineRetention, pendingReviewCount, pendingProgressCount, collectionsSyncPending,
  collections, onCreateCollection, onRenameCollection, onDeleteCollection, onCollectionMembership,
  initialTag, libraryPath, onLibraryNavigate, globalSearch, onGlobalSearch, theme, onThemeChange, onImportClick, onFiles, onOpen, onRead, onRemoveOffline,
  importing, notice, onDismissNotice, error, storageError, cloudRepo, cloudSession,
  cloudBusy, cloudMessage, syncProblem, onCloudRepo, onCloudLogin, onCloudLogout, onCloudRefresh, onCloudPublishCached,
}: Props) {
  const isMasterControls = libraryPath === '/master-controls';
  const [filter, setFilter] = useState<Filter>(() => parseLibraryViewPath(libraryPath).filter);
  const [showAdvanced, setShowAdvanced] = useState(() => parseLibraryViewPath(libraryPath).advanced);
  const [sort, setSort] = useState<Sort>('title');
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState(() => parseLibraryViewPath(libraryPath).tag || initialTag);
  const [selectedAuthor, setSelectedAuthor] = useState(() => parseLibraryViewPath(libraryPath).author);
  const [selectedCollectionId, setSelectedCollectionId] = useState(() => parseLibraryViewPath(libraryPath).collectionId);
  // The address bar is authoritative. Back, Forward, pasted links and reloads
  // must restore exactly the same shelf, tag, collection or analytics view.
  useEffect(() => {
    const view = parseLibraryViewPath(libraryPath);
    setFilter(view.filter);
    setShowAdvanced(view.advanced);
    setSelectedTag(view.tag);
    setSelectedAuthor(view.author);
    setSelectedCollectionId(view.collectionId);
    setQuery('');
  }, [libraryPath]);
  // A brand-new offline session defaults to downloaded books, without
  // hijacking an explicit analytics/tag/collection URL.
  useEffect(() => {
    if (!online && libraryPath === '/') onLibraryNavigate(libraryShelfUrl('offline'));
  }, [online, libraryPath, onLibraryNavigate]);
  useEffect(() => {
    if (selectedCollectionId && !collections.some(item => item.id === selectedCollectionId)) setSelectedCollectionId('');
  }, [collections, selectedCollectionId]);
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const availableTags = useMemo(() => tagCounts(books), [books]);
  // URL tag slugs are lowercase, but headings retain catalogue typography.
  const displayTag = availableTags.find(({tag}) => tag.toLocaleLowerCase() === selectedTag.toLocaleLowerCase())?.tag || selectedTag;
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
  // All native navigation menus should dismiss on a click outside or Escape,
  // without disturbing the menu's normal click and keyboard interaction.
  useEffect(() => {
    const closeMenus = (event: Event) => {
      document.querySelectorAll<HTMLDetailsElement>('.primary-top-nav details.top-nav-menu[open]').forEach(menu => {
        if (event.type === 'keydown' || !menu.contains(event.target as Node)) menu.open = false;
      });
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeMenus(event); };
    document.addEventListener('pointerdown', closeMenus);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', closeMenus);
      document.removeEventListener('keydown', onKey);
    };
  }, []);
  const [datasetToken, setDatasetToken] = useState('');
  const [dragging, setDragging] = useState(false);
  const reading = books.filter(isCurrentlyReading);
  const finished = books.filter((book) => book.shelfStatus !== 'trying' && isFinished(book));

  const globalMode = globalSearch.trim().length > 0;
  const selectedCollection = collections.find(c => c.id === selectedCollectionId);
  const showEditorialHome = !isMasterControls && books.length > 0 && libraryPath === '/' && filter === 'all' && !selectedTag && !selectedAuthor && !selectedCollectionId && !globalMode && !showAdvanced;
  const visible = useMemo(() => {
    const q = (globalMode ? globalSearch : query).trim().toLocaleLowerCase();
    return books.filter((book) => {
      // Global search always spans the entire library; local search stays scoped.
      if (!globalMode) {
        if (filter === 'offline' && !cachedEpubIds.includes(book.id)) return false;
         if (filter === 'trying' && book.shelfStatus !== 'trying') return false;
         if (filter !== 'all' && filter !== 'offline' && filter !== 'trying' && book.shelfStatus === 'trying') return false;
        if (filter === 'reading' && !isCurrentlyReading(book)) return false;
        if (filter === 'finished' && !isFinished(book)) return false;
        if (filter === 'unread' && (book.progress > 0 || isFinished(book))) return false;
        if (selectedTag && !includesTag(book, selectedTag)) return false;
        if (selectedAuthor && book.author.normalize('NFKC').trim().toLocaleLowerCase() !== selectedAuthor.normalize('NFKC').trim().toLocaleLowerCase()) return false;
        if (selectedCollection && !selectedCollection.bookIds.includes(book.id)) return false;
      }
      return !q || `${book.title} ${book.author} ${bookTags(book).join(' ')}`.toLocaleLowerCase().includes(q);
    }).sort((a, b) => globalMode || selectedTag || selectedAuthor || selectedCollection || sort === 'title'
      ? a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }) : sort === 'added' ? b.importedAt - a.importedAt
      : (b.lastOpenedAt ?? b.importedAt) - (a.lastOpenedAt ?? a.importedAt));
  }, [books, filter, sort, query, selectedTag, selectedAuthor, selectedCollection, globalSearch, globalMode, cachedEpubIds]);
  function browseAuthor(author: string) {
    setShowAdvanced(false); setSelectedTag(''); setSelectedAuthor(author);
    setSelectedCollectionId(''); setQuery(''); setFilter('all');
    onGlobalSearch(''); onLibraryNavigate(libraryAuthorUrl(author));
  }
  function browseTag(tag: string) {
    setShowAdvanced(false);
    setSelectedTag(tag); setSelectedAuthor('');
    setSelectedCollectionId('');
    setQuery('');
    setFilter('all');
    onGlobalSearch('');
    onLibraryNavigate(tag ? libraryTagUrl(tag) : libraryShelfUrl('all'));
  }
  function clearAuthor() {
    setSelectedAuthor(''); setQuery(''); onLibraryNavigate(libraryShelfUrl('all'));
  }
  function clearTag() {
    setSelectedTag(''); setQuery('');
    onLibraryNavigate(libraryShelfUrl('all'));
  }
  function browseCollection(id: string) {
    setShowAdvanced(false); setSelectedCollectionId(id); setSelectedTag(''); setSelectedAuthor('');
    setFilter('all'); setQuery(''); onGlobalSearch('');
    onLibraryNavigate(libraryCollectionUrl(id));
  }
  function clearCollection() { setSelectedCollectionId(''); setQuery(''); onLibraryNavigate(libraryShelfUrl('all')); }


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
  function goHome() {
    setShowAdvanced(false); setFilter('all');
    setSelectedTag(''); setSelectedAuthor(''); setSelectedCollectionId(''); setQuery('');
    onGlobalSearch(''); onLibraryNavigate('/');
  }
  function goTo(newFilter: Filter) {
    setShowAdvanced(false); setFilter(newFilter);
    setSelectedTag(''); setSelectedAuthor(''); setSelectedCollectionId(''); setQuery('');
    onGlobalSearch(''); onLibraryNavigate(libraryShelfUrl(newFilter));
  }

  const navEntries = [
    { id: 'reading' as Filter, name: 'Currently reading', count: reading.length, icon: BookOpen },
    { id: 'trying' as Filter, name: 'Trying out', count: books.filter(b => b.shelfStatus === 'trying').length, icon: Sparkles },
    { id: 'offline' as Filter, name: 'Available offline', count: books.filter(b => cachedEpubIds.includes(b.id)).length, icon: Download },
    { id: 'finished' as Filter, name: 'Finished', count: finished.length, icon: CheckCircle2 },
    { id: 'unread' as Filter, name: 'To be read', count: books.filter((b) => b.shelfStatus !== 'trying' && b.progress === 0 && !isFinished(b)).length, icon: Book },
    { id: 'all' as Filter, name: 'All books', count: books.length, icon: Library },
    { id: 'analytics' as Filter, name: 'Analytics', count: 0, icon: BarChart3 },
  ];

  return (
    <div className={`app-shell theme-${theme}`} onDragOver={over} onDrop={drop} onDragLeave={leave}>
      {dragging && <div className="drop-overlay" aria-hidden="true"><Upload size={46} /><strong>Drop your novels to import</strong><span>EPUB or supported Novel ZIP</span></div>}

      <main className="main-panel">
        <header className="topbar"><a className="library-wordmark" href="/" aria-label="Taiyou's Personal Library home" onClick={event => openInternalLinkInCurrentTab(event, goHome)}><span className="library-wordmark-mark"><BrandMark size={36} theme={theme}/></span><span className="library-wordmark-text"><strong>TAIYOU'S</strong><small>PERSONAL LIBRARY</small></span></a><section className="cloud-connect" aria-label="Cloud library storage" ref={cloudRoot}>
            <div className="cloud-connect-head"><span><Cloud size={16} /><strong>Cloud library</strong><small className={cloudRepo && cloudSession ? 'connection-badge is-connected' : 'connection-badge'}>{cloudRepo && cloudSession && <span className="cloud-connected-dot" aria-hidden="true" />}{cloudRepo && cloudSession ? 'Connected' : cloudRepo ? 'Disconnected' : 'Not set up'}</small></span>{syncProblem && <span className="cloud-sync-flag" role="status" title={syncProblem}>Needs sync</span>}{!cloudSession && online && <button type="button" className="secondary-button oauth-header-login" onClick={() => window.location.assign('/api/oauth/login')}><LogIn size={14}/> Sign in with HF</button>}<button type="button" className="secondary-button" aria-expanded={showCloud} onClick={() => setShowCloud(v => !v)}>{showCloud ? 'Close' : 'Settings'}</button></div>
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
          </section><div className="top-actions"><label className="global-search-field"><Search size={16} /><input aria-label="Search all novels" placeholder="Search all novels…" value={globalSearch} onChange={event => onGlobalSearch(event.target.value)} />{globalSearch && <button type="button" aria-label="Clear global search" onClick={() => onGlobalSearch('')}><X size={15} /></button>}</label><a href="/advanced-search" className="advanced-search-launch" aria-label="Advanced search" onClick={event => openInternalLinkInCurrentTab(event, () => { setShowAdvanced(true); onLibraryNavigate('/advanced-search'); })}><Search size={16} /><span>Advanced search</span></a><ThemeSwitcher value={theme} onChange={onThemeChange} label="Choose library theme" /></div></header>
        <nav className="primary-top-nav" aria-label="Library sections">
          <div className="top-nav-links">
            <a href="/" className={`top-nav-link ${libraryPath === '/' && !globalMode ? 'active' : ''}`}
              aria-current={libraryPath === '/' && !globalMode ? 'page' : undefined}
              onClick={event => openInternalLinkInCurrentTab(event, goHome)}>Home</a>
            {navEntries.map(({ id, name, count }) => <a href={libraryShelfUrl(id)} key={id} className={`top-nav-link ${!showAdvanced && !isMasterControls && filter === id && !selectedTag && !selectedAuthor && !selectedCollectionId ? 'active' : ''}`}
              aria-current={!showAdvanced && !isMasterControls && filter === id && !selectedTag && !selectedAuthor && !selectedCollectionId ? 'page' : undefined}
              onClick={event => openInternalLinkInCurrentTab(event, () => goTo(id))}><span>{name}</span>{id !== 'analytics' && <small>{count}</small>}</a>)}
          </div>
          <div className="mobile-shelf-nav" aria-label="Quick library shelves">
            <a href={libraryShelfUrl('reading')} className={filter === 'reading' && libraryPath !== '/' ? 'selected' : ''}
              onClick={event => openInternalLinkInCurrentTab(event, () => goTo('reading'))}>Reading</a>
            <a href={libraryShelfUrl('trying')} className={filter === 'trying' ? 'selected' : ''}
              onClick={event => openInternalLinkInCurrentTab(event, () => goTo('trying'))}>Trying</a>
            <a href={libraryShelfUrl('offline')} className={filter === 'offline' ? 'selected' : ''}
              onClick={event => openInternalLinkInCurrentTab(event, () => goTo('offline'))}>Offline</a>
            <label className="mobile-shelf-more">
              <span className="sr-only">More library shelves</span>
              <select aria-label="More library shelves"
                value={['finished','unread','all','analytics'].includes(filter) && libraryPath !== '/' && !selectedTag && !selectedCollectionId && !selectedAuthor ? filter : ''}
                onChange={event => goTo(event.target.value as Filter)}>
                <option value="" disabled>More…</option>
                <option value="finished">Finished</option>
                <option value="unread">To be read</option>
                <option value="all">All books</option>
                <option value="analytics">Analytics</option>
              </select>
              <ChevronDown size={14} aria-hidden="true"/>
            </label>
          </div>
          <div className="top-nav-tools">
            <details className="top-nav-menu" aria-label="Novel tags">
              <summary><Hash size={15}/> Tags <ChevronDown size={13}/></summary>
              <div className="top-nav-dropdown" role="group" aria-label="Browse tags">
                <strong className="top-nav-caption">BROWSE BY TAG</strong>
                {availableTags.length > 0 ? availableTags.map(({ tag, count }) =>
                  <a key={tag} href={libraryTagUrl(tag)} className="top-nav-dropdown-item" aria-label={`Browse novels tagged ${tag}`}
                    onClick={event => openInternalLinkInCurrentTab(event, () => { event.currentTarget.closest('details')?.removeAttribute('open'); browseTag(tag); })}>
                    <span>{tag}</span><small>{count}</small></a>)
                  : <p className="top-nav-empty">No tags yet</p>}
              </div>
            </details>
            <details className="top-nav-menu" aria-label="Novel collections">
              <summary><Library size={15}/> Collections <ChevronDown size={13}/></summary>
              <div className="top-nav-dropdown" role="group" aria-label="Manage collections">
                <strong className="top-nav-caption">YOUR COLLECTIONS</strong>
                {collections.map(collection => <a href={libraryCollectionUrl(collection.id)} key={collection.id} className="top-nav-dropdown-item"
                    aria-label={`Open collection ${collection.name}`} onClick={event => openInternalLinkInCurrentTab(event, () => {
                      event.currentTarget.closest('details')?.removeAttribute('open'); browseCollection(collection.id);
                    })}><span>{collection.name}</span><small>{collection.bookIds.length}</small></a>)}
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
            <a href="/master-controls" className="top-nav-master" aria-label="Open Master Controls"
              aria-current={isMasterControls ? 'page' : undefined}
              onClick={event => openInternalLinkInCurrentTab(event, () => { setShowCloud(false); onLibraryNavigate('/master-controls'); })}>
              <LockKeyhole size={16}/><span>Master</span>
            </a>
            <button type="button" className="top-nav-add" onClick={onImportClick} disabled={importing}>
              <Plus size={16}/><span>{importing ? 'Importing…' : 'Add novel'}</span>
            </button>
          </div>
        </nav>
        <div className="page-content">
          {notice && <div className="library-toast" role="status">
            <CheckCircle2 size={19} aria-hidden="true" /><span>{notice}</span>
            <button type="button" aria-label="Dismiss notification" onClick={onDismissNotice}><X size={18}/></button>
          </div>}
          {(error || storageError) && <div className="alert error-alert" role="alert">{error || storageError}</div>}
          {isMasterControls && <MasterControls books={allBooks} cachedEpubIds={cachedEpubIds}
            theme={theme} onExit={() => goTo('all')} onClearOffline={onMasterClearOffline}
            onSaveRating={onMasterSaveRating} onCorrectMetadata={onMasterCorrectMetadata}
            onMarkCompleted={onMasterMarkCompleted} onResetProgress={onMasterResetProgress}
            onSaveTags={onMasterSaveTags} onSaveSummary={onMasterSaveSummary}
            onSaveReview={onMasterSaveReview} onExportEpub={onMasterExportEpub}
            onDeleteNovel={onMasterDeleteNovel} staleCount={staleCount} onArchiveStale={onMasterArchiveStale}/>}

          {!showAdvanced && !showEditorialHome && !isMasterControls && filter !== 'analytics' && (selectedTag || selectedAuthor) && <div className="page-head page-head-compact">
            <div><div className="eyebrow"><span className="eyebrow-line" /> TAIYOU'S COLLECTION</div>
              <h1>{filter === 'offline' ? 'Offline library' : filter === 'trying' ? 'Trying out' : selectedCollection ? selectedCollection.name : selectedTag ? displayTag : selectedAuthor ? selectedAuthor : 'Your library'}<span className="serif-accent">.</span></h1>
              <p>{selectedAuthor && !globalMode ? `${visible.length} novels by ${selectedAuthor}` : selectedTag && !globalMode ? `${visible.length} ${visible.length === 1 ? 'novel' : 'novels'} in this category` : filter === 'offline' ? `${cachedEpubIds.length} downloaded for reading without a connection` : filter === 'trying' ? `${books.filter(b => b.shelfStatus === 'trying').length} novels to sample before deciding` : `${books.length} stories to explore, all in one place`}</p>
            </div>
            <div className="page-head-actions">
              {selectedTag && !globalMode && <button type="button" className="tag-clear-link" onClick={clearTag}>Show all novels <X size={13}/></button>}
              {selectedAuthor && !globalMode && <button type="button" className="tag-clear-link" onClick={clearAuthor}>All authors <X size={13}/></button>}
              <button className="primary-button desktop-import" onClick={onImportClick} disabled={importing}><Plus size={18}/>{importing ? 'Importing…' : 'Add a novel'}</button>
            </div>
          </div>}
          {!showAdvanced && !isMasterControls && filter === 'offline' && <section className="offline-health offline-management-bar" aria-label="Offline downloads">
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
                    {!isMasterControls && (showAdvanced ? <AdvancedSearch books={books} allBooks={allBooks} offlineIds={cachedEpubIds} initialName={globalSearch} cloudRepo={cloudRepo} cloudSession={cloudSession}
            onClose={() => { setShowAdvanced(false); onGlobalSearch(''); onLibraryNavigate(libraryShelfUrl('all')); }} onOpen={onOpen}
            onBrowseTag={browseTag} /> : filter === 'analytics' ? <UsageDashboard books={books} /> : <>

          {showEditorialHome && <EditorialHome books={books} allBooks={allBooks} collections={collections}
            onBrowseAll={() => goTo('all')} onBrowseShelf={goTo} onBrowseCollection={browseCollection}
            onOpen={onOpen} onRead={onRead} onBrowseTag={browseTag}
            cover={(book, isFeatured, onArtworkStateChange) => <Cover book={book} variant={isFeatured ? 'feature' : 'normal'} cloudRepo={cloudRepo} cloudSession={cloudSession} onArtworkStateChange={onArtworkStateChange} />} />}

          {!showEditorialHome && !isMasterControls && <section id="library-full-catalogue" className="library-section" aria-label="Book collection"><div className="section-titlebar"><div><div className="section-overline">{globalMode ? 'ALL NOVELS' : selectedCollection ? 'YOUR COLLECTION' : selectedTag ? 'BROWSING TAG' : selectedAuthor ? 'BROWSING AUTHOR' : 'THE COLLECTION'}</div><h2>{globalMode ? 'Global search results' : selectedCollection ? selectedCollection.name : selectedTag ? 'Novels' : selectedAuthor ? 'Books by ' + selectedAuthor : filter === 'all' ? 'All your stories' : navEntries.find((i) => i.id === filter)?.name}<span className="title-count">{visible.length}</span></h2></div><span className="library-description">A little world on every shelf</span></div>
            {selectedCollection && !globalMode && <div className="tag-collection-head collection-heading">
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
            </div>}<div className="library-toolbar"><div className="toolbar-right"><label className="tag-filter"><Tag size={16} /><select aria-label="Filter novels by tag" value={selectedTag} onChange={(e) => browseTag(e.target.value)}><option value="">All tags</option>{availableTags.map(({tag, count}) => <option key={tag} value={tag}>{tag} ({count})</option>)}</select><ChevronDown size={14} /></label><label className="search-field"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={selectedCollection ? `Search ${selectedCollection.name}…` : selectedTag ? `Search ${displayTag} novels…` : "Search this shelf…"} aria-label="Search within current list" />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>}</label><label className="sort-field"><Settings2 size={16} /><select value={selectedTag || selectedAuthor || selectedCollection || globalMode ? 'title' : sort} disabled={!!selectedTag || !!selectedAuthor || !!selectedCollection || globalMode} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort books"><option value="title">Title A–Z</option><option value="recent">Recent</option><option value="added">Date added</option></select><ChevronDown size={14} /></label></div></div>

            {visible.length ? <div className="book-grid">{visible.map((book) => <article className="book-tile" key={book.id}><a className="cover-button" href={namedNovelUrl(book, allBooks)}
                  onClick={event => openNovelInCurrentTab(event, () => onOpen(book))}
                  title={book.title} aria-label={`View details for ${book.title}`}>
                  <Cover book={book} cloudRepo={cloudRepo} cloudSession={cloudSession} />
                  <span className="cover-hover-title" aria-hidden="true">{book.title}</span>
                </a><div className="tile-meta"><div className="tile-title-row"><a className="tile-title"
                  href={namedNovelUrl(book, allBooks)}
                  onClick={event => openNovelInCurrentTab(event, () => onOpen(book))}
                  title={book.title}>{book.title}</a></div><button type="button" className="tile-author-link" onClick={() => browseAuthor(book.author)} aria-label={`View novels by ${book.author}`}>{book.author}</button>{filter === 'offline' && cachedEpubIds.includes(book.id) && <div className="offline-tile-actions">
                {book.cloud
                  ? <button type="button" className="offline-remove-button" onClick={() => onRemoveOffline(book)} aria-label={`Remove offline EPUB for ${book.title}`}>
                      <Trash2 size={14} /> Remove download
                    </button>
                  : <span className="offline-local-only">Local-only EPUB · keep a backup</span>}
              </div>}
              <div className="tile-tags" aria-label="Novel tags">{bookTags(book).slice(0, 5).map((tag) =>
                <button type="button" key={tag} title={tag} onClick={() => browseTag(tag)}
                  aria-label={`Browse novels tagged ${tag}`}>{tag}</button>)}
                {bookTags(book).length > 5 && <span title={bookTags(book).slice(5).join(', ')}
                  aria-label={`${bookTags(book).length - 5} more tags`}>+{bookTags(book).length - 5}</span>}
              </div>{collections.length > 0 && <div className="book-collection-tools">
              <label className="sr-only" htmlFor={`collection-add-${book.id}`}>Add {book.title} to collection</label>
              <select id={`collection-add-${book.id}`} aria-label={`Add ${book.title} to collection`} value="" onChange={event => {
                if (event.target.value) void onCollectionMembership(event.target.value, book.id, true);
              }}>
                <option value="">+ Add to collection…</option>
                {collections.filter(c => !c.bookIds.includes(book.id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {selectedCollection?.bookIds.includes(book.id) && <button type="button" onClick={() => void onCollectionMembership(selectedCollection.id, book.id, false)} aria-label={`Remove ${book.title} from collection`}>Remove from this collection</button>}
            </div>}<div className="tile-bottom" aria-label={book.progress > 0 ? `${Math.round(book.progress)}% read` : book.shelfStatus === 'trying' ? 'Trying out' : 'Not started'}>
              {book.shelfStatus === 'trying' && <span className="tile-trying-status">TRYING</span>}
              {book.personalRating && <span className="book-rating-pill"><Star size={12} fill="currentColor" /> {book.personalRating}/10</span>}
              {book.progress > 0 && <><div className="mini-progress" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, book.progress))}%` }} /></div><span className="tile-progress-value">{Math.round(book.progress)}%</span></>}
              </div></div></article>)}</div> : <div className="no-results"><BookOpen size={27} /><h3>{filter === 'offline' ? 'No novels saved offline' : books.length ? 'No novels on this shelf' : 'Your library is waiting'}</h3><p>{filter === 'offline' ? 'While connected, choose Save offline on a novel to make it available here.' : books.length ? 'Try a different search or tag.' : 'Import a novel ZIP, then connect your private cloud dataset to use the same collection on other devices.'}</p>{!books.length && <button className="secondary-button" onClick={onImportClick}><Upload size={17} /> Choose a ZIP or EPUB</button>}</div>}
            {filter === 'offline' && !globalMode && !selectedTag && localBackups.some(book => cachedEpubIds.includes(book.id)) &&
              <details className="offline-local-backups">
                <summary><BookOpen size={16}/> {localBackups.filter(book => cachedEpubIds.includes(book.id)).length} additional local EPUB {localBackups.filter(book => cachedEpubIds.includes(book.id)).length === 1 ? 'copy' : 'copies'} preserved
                  <small>Kept separately because a hosted novel has the same title and author</small></summary>
                <div className="offline-local-backup-list">
                  {localBackups.filter(book => cachedEpubIds.includes(book.id)).map(book =>
                    <div key={book.id} className="offline-local-backup-row">
                      <div><strong>{book.title}</strong><span>Local-only backup · {book.author} · {Math.round(book.progress)}% read</span></div>
                      <button type="button" onClick={() => onOpen(book)}>Open local copy</button>
                      <button type="button" onClick={() => onRead(book)}>Read local copy</button>
                    </div>)}
                </div>
              </details>}
            <div className="collection-footer"><span><CloudOff size={15} /> {cloudSession && cloudRepo ? 'Novel archives upload to your private dataset' : 'Novels imported locally until cloud is connected'}</span><span>{books.length} {books.length === 1 ? 'book' : 'books'} in your private collection</span></div>
          </section>}
          <button className="mobile-fab" onClick={onImportClick} aria-label="Add a novel"><Plus size={24} /></button>
          </>)}
        </div>
        <footer className="site-credit-footer">© {new Date().getFullYear()} Taiyou's Personal Library <span aria-hidden="true">·</span> Created by Taiyou</footer>
      </main>
    </div>
  );
}
