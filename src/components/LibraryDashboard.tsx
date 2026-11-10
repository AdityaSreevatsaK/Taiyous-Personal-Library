import { useEffect, useMemo, useState, type DragEvent } from 'react';
import AdvancedSearch from './AdvancedSearch';
import {
  ArrowRight, Book, BookOpen, CheckCircle2, ChevronDown, CloudOff, Download, WifiOff,
  Feather, Hash, Library, LockKeyhole, Menu, Moon, Pencil, Plus, Search, Settings2,
  Sparkles, Star, Sun, Tag, Trash2, Upload, X, Cloud, RefreshCw, LogIn, LogOut,
} from 'lucide-react';
import type { LibraryBook, ReaderTheme } from '../types';
import { bookTags, includesTag, tagCounts } from '../lib/tags';
import type { CloudSession } from '../lib/cloud';
import type { BookCollection } from '../lib/collections';

type Filter = 'all' | 'reading' | 'unread' | 'finished' | 'offline';
type Sort = 'recent' | 'title' | 'added';

interface Props {
  books: LibraryBook[];
  cachedEpubIds: string[];
  online: boolean;
  offlineShellReady: boolean;
  cachingId: string | null;
  onCacheForOffline: (book: LibraryBook) => void;
  bulkOfflineProgress: { done: number; total: number } | null;
  onCacheAllOffline: () => void;
  pendingReviewCount: number;
  pendingProgressCount: number;
  collectionsSyncPending: boolean;
  collections: BookCollection[];
  onCreateCollection: (name: string) => Promise<void>;
  onRenameCollection: (id: string, name: string) => Promise<void>;
  onDeleteCollection: (id: string) => Promise<void>;
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
  onDelete: (book: LibraryBook) => void;
  importing: boolean;
  notice: string | null;
  error: string | null;
  storageError: string | null;
  cloudRepo: string;
  cloudSession: CloudSession | null;
  cloudBusy: boolean;
  cloudMessage: string | null;
  onCloudRepo: (repo: string) => void;
  onCloudLogin: (token: string) => void;
  onCloudLogout: () => void;
  onCloudRefresh: () => void;
  onCloudPublishCached: () => void;
}

const themes: ReaderTheme[] = ['light', 'dark', 'sepia'];

export function Cover({ book, variant = 'normal' }: { book: LibraryBook; variant?: 'normal' | 'feature' }) {
  const coverNumber = parseInt(book.id.slice(0, 2), 16) % 6;
  return (
    <div className={`cover cover-${coverNumber} ${variant === 'feature' ? 'cover-feature' : ''}`} aria-hidden="true">
      <div className="cover-ornament top-ornament">✦</div>
      <div className="cover-lilies"><span>❧</span></div>
      <div className="cover-heading">{book.title}</div>
      <div className="cover-author">{book.author}</div>
      <div className="cover-bottom"><span>TAIYOU'S LIBRARY</span><span>✦</span></div>
    </div>
  );
}

export default function LibraryDashboard({
  books, cachedEpubIds, online, offlineShellReady, cachingId, onCacheForOffline, bulkOfflineProgress, onCacheAllOffline, pendingReviewCount, pendingProgressCount, collectionsSyncPending,
  collections, onCreateCollection, onRenameCollection, onDeleteCollection, onCollectionMembership,
  initialTag, globalSearch, onGlobalSearch, theme, onThemeChange, onImportClick, onFiles, onOpen, onRead, onDelete,
  importing, notice, error, storageError, cloudRepo, cloudSession,
  cloudBusy, cloudMessage, onCloudRepo, onCloudLogin, onCloudLogout, onCloudRefresh, onCloudPublishCached,
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
  const [sort, setSort] = useState<Sort>('recent');
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState(initialTag);
  const [selectedCollectionId, setSelectedCollectionId] = useState('');
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const availableTags = useMemo(() => tagCounts(books), [books]);
  const [repoDraft, setRepoDraft] = useState(cloudRepo);
  const [showCloud, setShowCloud] = useState(false);
  const [datasetToken, setDatasetToken] = useState('');
  const [dragging, setDragging] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const reading = books.filter((book) => book.progress > 0 && book.progress < 99.5);
  const finished = books.filter((book) => book.progress >= 99.5);
  const featured = [...reading].sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0))[0] || books[0];

  const globalMode = globalSearch.trim().length > 0;
  const selectedCollection = collections.find(c => c.id === selectedCollectionId);
  const visible = useMemo(() => {
    const q = (globalMode ? globalSearch : query).trim().toLocaleLowerCase();
    return books.filter((book) => {
      // Global search always spans the entire library; local search stays scoped.
      if (!globalMode) {
        if (filter === 'offline' && !cachedEpubIds.includes(book.id)) return false;
        if (filter === 'reading' && !(book.progress > 0 && book.progress < 99.5)) return false;
        if (filter === 'finished' && book.progress < 99.5) return false;
        if (filter === 'unread' && book.progress > 0) return false;
        if (selectedTag && !includesTag(book, selectedTag)) return false;
        if (selectedCollection && !selectedCollection.bookIds.includes(book.id)) return false;
      }
      return !q || `${book.title} ${book.author} ${bookTags(book).join(' ')}`.toLocaleLowerCase().includes(q);
    }).sort((a, b) => globalMode || selectedTag || selectedCollection || sort === 'title'
      ? a.title.localeCompare(b.title) : sort === 'added' ? b.importedAt - a.importedAt
      : (b.lastOpenedAt ?? b.importedAt) - (a.lastOpenedAt ?? a.importedAt));
  }, [books, filter, sort, query, selectedTag, selectedCollection, globalSearch, globalMode, cachedEpubIds]);
  function browseTag(tag: string) {
    setShowAdvanced(false);
    setSelectedTag(tag);
    setSelectedCollectionId('');
    setQuery('');
    setFilter('all');
    onGlobalSearch('');
    setSidebarOpen(false);
  }
  function clearTag() { setSelectedTag(''); setQuery(''); }
  function browseCollection(id: string) { setShowAdvanced(false); setSelectedCollectionId(id); setSelectedTag(''); setFilter('all'); setQuery(''); onGlobalSearch(''); setSidebarOpen(false); }
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
  function goTo(newFilter: Filter) { setShowAdvanced(false); setFilter(newFilter); clearTag(); clearCollection(); onGlobalSearch(''); setSidebarOpen(false); }


  const navEntries = [
    { id: 'all' as Filter, name: 'All books', count: books.length, icon: Library },
    { id: 'reading' as Filter, name: 'Currently reading', count: reading.length, icon: BookOpen },
    { id: 'unread' as Filter, name: 'To be read', count: books.filter((b) => b.progress === 0).length, icon: Book },
    { id: 'finished' as Filter, name: 'Finished', count: finished.length, icon: CheckCircle2 },
    { id: 'offline' as Filter, name: 'Available offline', count: cachedEpubIds.length, icon: Download },
  ];

  return (
    <div className={`app-shell theme-${theme}`} onDragOver={over} onDrop={drop} onDragLeave={leave}>
      {dragging && <div className="drop-overlay" aria-hidden="true"><Upload size={46} /><strong>Drop your novels to import</strong><span>EPUB or supported Novel ZIP</span></div>}
      {sidebarOpen && <button className="mobile-shade" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand"><div className="brand-mark"><Feather size={21} strokeWidth={1.9} /></div><div><strong>Taiyou's<span className="brand-line">Personal Library</span></strong><small>PRIVATE READING SPACE</small></div></div>
        <div className="sidebar-scroll">
          <p className="side-caption">YOUR SHELVES</p>
          <nav className="side-links" aria-label="Library sections">
            {navEntries.map(({ id, name, count, icon: Icon }) => (
              <button key={id} className={`side-link ${!showAdvanced && filter === id ? 'active' : ''}`} onClick={() => goTo(id)}>
                <Icon size={18} strokeWidth={1.9} /><span>{name}</span><em>{count}</em>
              </button>
            ))}
          </nav>
          <button type="button" className={`side-link advanced-side-link ${showAdvanced ? 'active' : ''}`}
            onClick={() => { setShowAdvanced(true); setSidebarOpen(false); }}>
            <Search size={18} strokeWidth={1.9}/><span>Advanced search</span><ArrowRight size={15}/>
          </button>
          {availableTags.length > 0 && <><p className="side-caption collection-caption">BROWSE BY TAG</p><div className="sidebar-tag-list">{availableTags.slice(0, 12).map(({ tag, count }) => <button key={tag} type="button" className={`sidebar-tag ${selectedTag.toLowerCase() === tag.toLowerCase() ? 'active' : ''}`} onClick={() => browseTag(selectedTag.toLowerCase() === tag.toLowerCase() ? '' : tag)}><Hash size={14} /><span>{tag}</span><em>{count}</em></button>)}</div></>}
          <div className="side-collection-title"><p className="side-caption collection-caption">YOUR COLLECTIONS</p><button type="button" onClick={() => setCreatingCollection(v => !v)} aria-label="Create collection" title="Create collection"><Plus size={17} /></button></div>
          {creatingCollection && <form className="collection-create-form" onSubmit={event => {
            event.preventDefault(); if (!newCollectionName.trim()) return;
            void onCreateCollection(newCollectionName).then(() => { setNewCollectionName(''); setCreatingCollection(false); setSidebarOpen(false); });
          }}>
            <label className="sr-only" htmlFor="collection-name-input">Collection name</label>
            <input id="collection-name-input" maxLength={90} value={newCollectionName} onChange={event => setNewCollectionName(event.target.value)} placeholder="e.g. Harry Potter" required />
            <button type="submit" aria-label="Save new collection"><CheckCircle2 size={17} /></button>
          </form>}
          <div className="sidebar-tag-list" aria-label="Novel collections">
            {collections.map(c => <button key={c.id} type="button" className={`sidebar-tag ${selectedCollectionId === c.id ? 'active' : ''}`} onClick={() => browseCollection(c.id)} aria-label={`Open collection ${c.name}`}><Library size={14} /><span>{c.name}</span><em>{c.bookIds.length}</em></button>)}
          </div>
          <p className="side-caption collection-caption">YOUR NOVELS</p>
          <button className="collection-link" onClick={onImportClick}><span className="collection-icon"><Plus size={16} /></span><span>Add a new novel</span></button>
          <div className="side-note"><Sparkles size={17} /><p>“There is no friend as loyal as a book.”<small>ERNEST HEMINGWAY</small></p></div>
        </div>
        <div className="sidebar-bottom"><div className="privacy-indicator"><LockKeyhole size={15} /><span>{cloudRepo && cloudSession ? "Private · Cloud + local cache" : "Private · Stored on this device"}</span></div><button className="sidebar-theme" onClick={() => onThemeChange(themes[(themes.indexOf(theme) + 1) % themes.length])} title="Cycle between light, dark and sepia"><Sun size={17} /><span>{theme === 'dark' ? 'Dark' : theme === 'sepia' ? 'Sepia' : 'Light'} appearance</span><Moon size={15} /></button></div>
      </aside>

      <main className="main-panel">
        <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={22} /></button><div className="breadcrumbs"><span>MY LIBRARY</span><span className="crumb-slash">/</span><strong>{showAdvanced ? 'Advanced search' : globalMode ? 'Global search' : selectedCollection ? `Collection: ${selectedCollection.name}` : selectedTag ? `Tag: ${selectedTag}` : filter === 'all' ? 'All books' : navEntries.find((i) => i.id === filter)?.name}</strong></div><div className="top-actions"><label className="global-search-field"><Search size={16} /><input aria-label="Search all novels" placeholder="Search all novels…" value={globalSearch} onChange={event => onGlobalSearch(event.target.value)} />{globalSearch && <button type="button" aria-label="Clear global search" onClick={() => onGlobalSearch('')}><X size={15} /></button>}</label><button type="button" className="advanced-search-launch" onClick={() => { setShowAdvanced(true); setSidebarOpen(false); }}><Search size={16} /><span>Advanced search</span></button><button className="icon-button theme-switch" onClick={() => onThemeChange(themes[(themes.indexOf(theme) + 1) % themes.length])} title="Change theme" aria-label="Change theme">{theme === 'dark' ? <Moon size={19} /> : <Sun size={19} />}</button></div></header>
        <div className="page-content">
          {notice && <div className="alert success-alert" role="status"><CheckCircle2 size={17} />{notice}</div>}
          {(error || storageError) && <div className="alert error-alert" role="alert">{error || storageError}</div>}
          {!showAdvanced && <div className="page-head page-head-compact">
            <div><div className="eyebrow"><span className="eyebrow-line" /> TAIYOU'S COLLECTION</div>
              <h1>{filter === 'offline' ? 'Offline library' : selectedCollection ? selectedCollection.name : selectedTag ? selectedTag : 'Your library'}<span className="serif-accent">.</span></h1>
              <p>{filter === 'offline' ? `${cachedEpubIds.length} downloaded for reading without a connection` : `${books.length} stories to explore, all in one place`}</p>
            </div>
            <button className="primary-button desktop-import" onClick={onImportClick} disabled={importing}><Plus size={18}/>{importing ? 'Importing…' : 'Add a novel'}</button>
          </div>}
          <div className="library-utility-bar">
          {!showAdvanced && <div className="offline-health" role="status" aria-label="Offline availability">
            <span className={online ? 'offline-connection online' : 'offline-connection offline'}>
              {online ? <Cloud size={14} /> : <WifiOff size={14} />}
              {online ? 'Online' : 'Offline'}
            </span>
            <span><Download size={14} /> {cachedEpubIds.length} of {books.length} EPUBs saved on this device</span>
            {cachedEpubIds.length < books.length && books.length > 0 && <button type="button" className="offline-cache-all-btn"
              onClick={onCacheAllOffline} disabled={!online || !!bulkOfflineProgress}
              aria-label="Save all novels for offline reading"><Download size={13} />
              {bulkOfflineProgress ? `Saving ${bulkOfflineProgress.done} of ${bulkOfflineProgress.total}…` : 'Save all offline'}
            </button>}
            <span>{offlineShellReady ? 'Offline app assets cached' : 'Offline app assets not yet cached'}</span>
            {pendingReviewCount > 0 && <span className="pending-sync-status">{pendingReviewCount} note{pendingReviewCount === 1 ? '' : 's'} waiting to sync</span>}
            {pendingProgressCount > 0 && <span className="pending-sync-status">{pendingProgressCount} reading position{pendingProgressCount === 1 ? '' : 's'} waiting to sync</span>}
            {collectionsSyncPending && <span className="pending-sync-status">Collections waiting to sync</span>}
          </div>}
          <section className="cloud-connect" aria-label="Cloud library storage">
            <div className="cloud-connect-head"><span><Cloud size={16} /><strong>Cloud library</strong><small className={cloudRepo && cloudSession ? 'connection-badge is-connected' : 'connection-badge'}>{cloudRepo && cloudSession ? 'Connected' : cloudRepo ? 'Disconnected' : 'Not set up'}</small></span><button type="button" className="secondary-button" aria-expanded={showCloud} onClick={() => setShowCloud(v => !v)}>{showCloud ? 'Close' : 'Settings'}</button></div>
            {showCloud && <div className="cloud-connect-body">
              <p>Use one private Hugging Face dataset as the shared <code>data/</code> folder on PC and mobile. When connected, importing a ZIP saves its original archive, EPUB and catalogue to that repository.</p>
              <form onSubmit={event => {event.preventDefault(); onCloudRepo(repoDraft); }} className="cloud-repo-form"><label htmlFor="cloud-repo-input">Private dataset repository</label><input id="cloud-repo-input" value={repoDraft} onChange={event => setRepoDraft(event.target.value)} placeholder="your-username/taiyous-novels" autoComplete="off" /><button type="submit" className="secondary-button">Save</button></form>
              <div className="cloud-actions">
                {cloudSession ? <><button type="button" className="secondary-button" disabled={!cloudRepo || cloudBusy} onClick={onCloudRefresh}><RefreshCw size={16}/>{cloudBusy ? 'Refreshing…' : 'Refresh cloud'}</button><button type="button" className="secondary-button" disabled={cloudBusy || !books.some(book => !book.cloud)} onClick={onCloudPublishCached}><Upload size={16}/> Publish cached EPUBs ({books.filter(book => !book.cloud).length})</button><button type="button" className="secondary-button" onClick={onCloudLogout}><LogOut size={16}/> Disconnect</button></> : <form className="cloud-token-form" onSubmit={event => {
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
                </form>}
              </div>
              <p className="cloud-caution" id="cloud-token-note">Use only the fine-grained <strong>Taiyou-Novels-Storage</strong> token with access to this private dataset, not your Space deployment token. The token is held in memory only, never saved or uploaded to the Space. You'll reconnect after each refresh. Keep tokens confidential; only import trusted book files.</p>
            </div>}
            {cloudMessage && (!cloudSession || /unavailable|failed|error/i.test(cloudMessage)) && <p className="cloud-status" role="status">{cloudMessage}</p>}
          </section>
          </div>
          {showAdvanced ? <AdvancedSearch books={books} offlineIds={cachedEpubIds} initialName={globalSearch}
            onClose={() => { setShowAdvanced(false); onGlobalSearch(''); }} onOpen={onOpen}
            onBrowseTag={browseTag} /> : <>

          {reading.length > 0 && featured && (
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

          <section className="library-section" aria-label="Book collection"><div className={`section-titlebar ${!globalMode && !selectedTag && !selectedCollection && (filter === 'all' || filter === 'offline') ? 'section-titlebar-quiet' : '' }`}><div><div className="section-overline">{globalMode ? 'ALL NOVELS' : selectedCollection ? 'YOUR COLLECTION' : selectedTag ? 'BROWSING TAG' : 'THE COLLECTION'}</div><h2>{globalMode ? 'Global search results' : selectedCollection ? selectedCollection.name : selectedTag ? selectedTag : filter === 'all' ? 'All your stories' : navEntries.find((i) => i.id === filter)?.name}<span className="title-count">{visible.length}</span></h2></div><span className="library-description">A little world on every shelf</span></div>
            {selectedTag && !globalMode && <div className="tag-collection-head"><span>Novels tagged <strong>{selectedTag}</strong> · Sorted A–Z</span><button type="button" onClick={clearTag}>Show all novels <X size={13} /></button></div>}{selectedCollection && !globalMode && <div className="tag-collection-head collection-heading">
              <span><strong>{selectedCollection.name}</strong> · {visible.length} novels · Sorted A–Z</span>
              <div className="collection-actions">
                <button type="button" onClick={() => {
                  const value = window.prompt('Rename collection', selectedCollection.name);
                  if (value?.trim()) void onRenameCollection(selectedCollection.id, value);
                }}><Pencil size={13} /> Rename</button>
                <button type="button" onClick={() => {
                  if (window.confirm(`Delete the collection "${selectedCollection.name}"? The novels themselves will remain untouched.`)) {
                    void onDeleteCollection(selectedCollection.id).then(() => clearCollection());
                  }
                }}><Trash2 size={13} /> Delete</button>
                <button type="button" onClick={clearCollection}>All novels <X size={13} /></button>
              </div>
            </div>}<div className="library-toolbar"><div className="filter-tabs">{(['all', 'reading', 'unread', 'finished', 'offline'] as Filter[]).map((name) => <button key={name} onClick={() => { setFilter(name); onGlobalSearch(''); }} className={filter === name ? 'selected' : ''}>{name === 'all' ? 'All' : name === 'reading' ? 'Reading' : name === 'unread' ? 'Unread' : name === 'offline' ? 'Offline' : 'Finished'}</button>)}</div><div className="toolbar-right"><label className="tag-filter"><Tag size={16} /><select aria-label="Filter novels by tag" value={selectedTag} onChange={(e) => browseTag(e.target.value)}><option value="">All tags</option>{availableTags.map(({tag, count}) => <option key={tag} value={tag}>{tag} ({count})</option>)}</select><ChevronDown size={14} /></label><label className="search-field"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={selectedCollection ? `Search ${selectedCollection.name}…` : selectedTag ? `Search ${selectedTag} novels…` : "Search this shelf…"} aria-label="Search within current list" />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>}</label><label className="sort-field"><Settings2 size={16} /><select value={selectedTag || selectedCollection || globalMode ? 'title' : sort} disabled={!!selectedTag || !!selectedCollection || globalMode} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort books"><option value="recent">Recent</option><option value="title">Title A–Z</option><option value="added">Date added</option></select><ChevronDown size={14} /></label></div></div>

            {visible.length ? <div className="book-grid">{visible.map((book) => <article className="book-tile" key={book.id}><button className="cover-button" onClick={() => onOpen(book)} aria-label={`View details for ${book.title}`}><Cover book={book} /></button><div className="tile-meta"><div className="offline-book-status">
                {cachedEpubIds.includes(book.id)
                  ? <span className="offline-ready-badge"><CheckCircle2 size={13} /> Available offline</span>
                  : <button type="button" className="offline-cache-btn" aria-label={`Save ${book.title} for offline reading`}
                      disabled={!online || cachingId === book.id}
                      title={!online ? 'Reconnect to fetch this EPUB' : 'Keep a local EPUB copy in this browser'}
                      onClick={() => onCacheForOffline(book)}>
                      <Download size={13} /> {cachingId === book.id ? 'Saving…' : 'Save offline'}
                    </button>}
              </div><div className="tile-title-row"><button className="tile-title" onClick={() => onOpen(book)} title={book.title}>{book.title}</button><button className="tile-delete" aria-label={`Remove ${book.title}`} title={book.cloud ? "Hosted in your private cloud dataset" : "Remove from this device"} onClick={() => onDelete(book)}><Trash2 size={14} /></button></div><p>{book.author}</p>{bookTags(book).length > 0 && <div className="tile-tags">{bookTags(book).slice(0, 3).map((tag) => <button type="button" key={tag} onClick={() => browseTag(tag)} aria-label={`Browse novels tagged ${tag}`}>{tag}</button>)}{bookTags(book).length > 3 && <span>+{bookTags(book).length - 3}</span>}</div>}{collections.length > 0 && <div className="book-collection-tools">
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
