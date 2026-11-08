import { useMemo, useState, type DragEvent } from 'react';
import {
  ArrowRight, Book, BookOpen, CheckCircle2, ChevronDown, CloudOff,
  Feather, Hash, Library, LockKeyhole, Menu, Moon, Plus, Search, Settings2,
  Sparkles, Sun, Tag, Trash2, Upload, X, Cloud, RefreshCw, LogIn, LogOut,
} from 'lucide-react';
import type { LibraryBook, ReaderTheme } from '../types';
import { bookTags, includesTag, tagCounts } from '../lib/tags';
import type { CloudSession } from '../lib/cloud';

type Filter = 'all' | 'reading' | 'unread' | 'finished';
type Sort = 'recent' | 'title' | 'added';

interface Props {
  books: LibraryBook[];
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
  books, theme, onThemeChange, onImportClick, onFiles, onOpen, onRead, onDelete,
  importing, notice, error, storageError, cloudRepo, cloudSession,
  cloudBusy, cloudMessage, onCloudRepo, onCloudLogin, onCloudLogout, onCloudRefresh, onCloudPublishCached,
}: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const availableTags = useMemo(() => tagCounts(books), [books]);
  const [repoDraft, setRepoDraft] = useState(cloudRepo);
  const [showCloud, setShowCloud] = useState(false);
  const [datasetToken, setDatasetToken] = useState('');
  const [dragging, setDragging] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const reading = books.filter((book) => book.progress > 0 && book.progress < 99.5);
  const finished = books.filter((book) => book.progress >= 99.5);
  const featured = [...reading].sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0))[0] || books[0];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return books.filter((book) => {
      if (filter === 'reading' && !(book.progress > 0 && book.progress < 99.5)) return false;
      if (filter === 'finished' && book.progress < 99.5) return false;
      if (filter === 'unread' && book.progress > 0) return false;
      if (selectedTag && !includesTag(book, selectedTag)) return false;
      return !q || `${book.title} ${book.author} ${bookTags(book).join(' ')}`.toLowerCase().includes(q);
    }).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title)
      : sort === 'added' ? b.importedAt - a.importedAt
      : (b.lastOpenedAt ?? b.importedAt) - (a.lastOpenedAt ?? a.importedAt));
  }, [books, filter, sort, query, selectedTag]);

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
  function goTo(newFilter: Filter) { setFilter(newFilter); setSidebarOpen(false); }


  const navEntries = [
    { id: 'all' as Filter, name: 'All books', count: books.length, icon: Library },
    { id: 'reading' as Filter, name: 'Currently reading', count: reading.length, icon: BookOpen },
    { id: 'unread' as Filter, name: 'To be read', count: books.filter((b) => b.progress === 0).length, icon: Book },
    { id: 'finished' as Filter, name: 'Finished', count: finished.length, icon: CheckCircle2 },
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
              <button key={id} className={`side-link ${filter === id ? 'active' : ''}`} onClick={() => goTo(id)}>
                <Icon size={18} strokeWidth={1.9} /><span>{name}</span><em>{count}</em>
              </button>
            ))}
          </nav>
          {availableTags.length > 0 && <><p className="side-caption collection-caption">BROWSE BY TAG</p><div className="sidebar-tag-list">{availableTags.slice(0, 12).map(({ tag, count }) => <button key={tag} type="button" className={`sidebar-tag ${selectedTag.toLowerCase() === tag.toLowerCase() ? 'active' : ''}`} onClick={() => { setSelectedTag(selectedTag.toLowerCase() === tag.toLowerCase() ? '' : tag); setSidebarOpen(false); }}><Hash size={14} /><span>{tag}</span><em>{count}</em></button>)}</div></>}
          <p className="side-caption collection-caption">YOUR COLLECTION</p>
          <button className="collection-link" onClick={onImportClick}><span className="collection-icon"><Plus size={16} /></span><span>Add a new novel</span></button>
          <div className="side-note"><Sparkles size={17} /><p>“There is no friend as loyal as a book.”<small>ERNEST HEMINGWAY</small></p></div>
        </div>
        <div className="sidebar-bottom"><div className="privacy-indicator"><LockKeyhole size={15} /><span>{cloudRepo && cloudSession ? "Private · Cloud + local cache" : "Private · Stored on this device"}</span></div><button className="sidebar-theme" onClick={() => onThemeChange(themes[(themes.indexOf(theme) + 1) % themes.length])} title="Cycle between light, dark and sepia"><Sun size={17} /><span>{theme === 'dark' ? 'Dark' : theme === 'sepia' ? 'Sepia' : 'Light'} appearance</span><Moon size={15} /></button></div>
      </aside>

      <main className="main-panel">
        <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={22} /></button><div className="breadcrumbs"><span>MY LIBRARY</span><span className="crumb-slash">/</span><strong>{filter === 'all' ? 'All books' : navEntries.find((i) => i.id === filter)?.name}</strong></div><div className="top-actions"><span className="private-chip"><LockKeyhole size={13} /> PERSONAL SPACE</span><button className="icon-button theme-switch" onClick={() => onThemeChange(themes[(themes.indexOf(theme) + 1) % themes.length])} title="Change theme" aria-label="Change theme">{theme === 'dark' ? <Moon size={19} /> : <Sun size={19} />}</button></div></header>
        <div className="page-content">
          <section className="cloud-connect" aria-label="Cloud library storage">
            <div className="cloud-connect-head"><span><Cloud size={17} /> <strong>Shared novel library</strong> <small>{cloudRepo && cloudSession ? `Connected · ${cloudSession.username}` : cloudRepo ? 'Connect private dataset' : 'Not configured'}</small></span><button type="button" className="secondary-button" onClick={() => setShowCloud(v => !v)}>{showCloud ? 'Hide settings' : 'Cloud settings'}</button></div>
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
            {cloudMessage && <p className="cloud-status" role="status">{cloudMessage}</p>}
          </section>
          {notice && <div className="alert success-alert" role="status"><CheckCircle2 size={17} />{notice}</div>}
          {(error || storageError) && <div className="alert error-alert" role="alert">{error || storageError}</div>}
          <div className="page-head"><div><div className="eyebrow"><span className="eyebrow-line" /> YOUR READING CORNER</div><h1>Your library<span className="serif-accent">.</span></h1><p>Every story deserves a beautiful place to live.</p></div><button className="primary-button desktop-import" onClick={onImportClick} disabled={importing}><Plus size={18} />{importing ? 'Importing…' : 'Add a novel'}</button></div>

          {reading.length > 0 && featured && (
            <section className="feature-panel" aria-label="Featured book"><div className="feature-decoration" aria-hidden="true">✺</div><div className="feature-copy"><div className="feature-eyebrow"><span className="feature-dot" /> {featured.progress > 0 ? 'PICK UP WHERE YOU LEFT OFF' : 'A STORY IS WAITING FOR YOU'}</div><h2><button type="button" className="featured-title-link" onClick={() => onOpen(featured)}>{featured.title}</button></h2><p className="feature-author">by {featured.author}</p><div className="feature-stats"><span><BookOpen size={15} /> {featured.chapterCount ? `${featured.chapterCount} chapters` : 'EPUB edition'}</span><span className="feature-stat-sep">·</span><span>{featured.progress ? `${Math.round(featured.progress)}% read` : 'Ready to begin'}</span></div><button className="feature-button" onClick={() => onRead(featured)}>{featured.progress > 0 ? 'Continue reading' : 'Start reading'} <ArrowRight size={17} /></button></div><div className="featured-cover-wrap"><Cover book={featured} variant="feature" /></div></section>
          )}

          <section className="library-section" aria-label="Book collection"><div className="section-titlebar"><div><div className="section-overline">THE COLLECTION</div><h2>{filter === 'all' ? 'All your stories' : navEntries.find((i) => i.id === filter)?.name}<span className="title-count">{visible.length}</span></h2></div><span className="library-description">A little world on every shelf</span></div>
            <div className="library-toolbar"><div className="filter-tabs">{(['all', 'reading', 'unread', 'finished'] as Filter[]).map((name) => <button key={name} onClick={() => setFilter(name)} className={filter === name ? 'selected' : ''}>{name === 'all' ? 'All' : name === 'reading' ? 'Reading' : name === 'unread' ? 'Unread' : 'Finished'}</button>)}</div><div className="toolbar-right"><label className="tag-filter"><Tag size={16} /><select aria-label="Filter novels by tag" value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)}><option value="">All tags</option>{availableTags.map(({tag, count}) => <option key={tag} value={tag}>{tag} ({count})</option>)}</select><ChevronDown size={14} /></label><label className="search-field"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your library…" aria-label="Search books" />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>}</label><label className="sort-field"><Settings2 size={16} /><select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort books"><option value="recent">Recent</option><option value="title">Title A–Z</option><option value="added">Date added</option></select><ChevronDown size={14} /></label></div></div>

            {visible.length ? <div className="book-grid">{visible.map((book) => <article className="book-tile" key={book.id}><button className="cover-button" onClick={() => onOpen(book)} aria-label={`View details for ${book.title}`}><Cover book={book} /></button><div className="tile-meta"><div className="tile-title-row"><button className="tile-title" onClick={() => onOpen(book)} title={book.title}>{book.title}</button><button className="tile-delete" aria-label={`Remove ${book.title}`} title={book.cloud ? "Hosted in your private cloud dataset" : "Remove from this device"} onClick={() => onDelete(book)}><Trash2 size={14} /></button></div><p>{book.author}</p>{bookTags(book).length > 0 && <div className="tile-tags">{bookTags(book).slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}{bookTags(book).length > 3 && <span>+{bookTags(book).length - 3}</span>}</div>}<div className="tile-bottom">{book.progress > 0 ? <><div className="mini-progress"><i style={{ width: `${book.progress}%` }} /></div><span>{Math.round(book.progress)}%</span></> : <span className="unread-label">NOT STARTED</span>}</div></div></article>)}</div> : <div className="no-results"><BookOpen size={27} /><h3>{books.length ? 'No novels on this shelf' : 'Your library is waiting'}</h3><p>{books.length ? 'Try a different search or tag.' : 'Import a novel ZIP, then connect your private cloud dataset to use the same collection on other devices.'}</p>{!books.length && <button className="secondary-button" onClick={onImportClick}><Upload size={17} /> Choose a ZIP or EPUB</button>}</div>}
            <div className="collection-footer"><span><CloudOff size={15} /> {cloudSession && cloudRepo ? 'Novel archives upload to your private dataset' : 'Novels imported locally until cloud is connected'}</span><span>{books.length} {books.length === 1 ? 'book' : 'books'} in your private collection</span></div>
          </section>
          <button className="mobile-fab" onClick={onImportClick} aria-label="Add a novel"><Plus size={24} /></button>
        </div>
      </main>
    </div>
  );
}
