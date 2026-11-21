import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight, BookOpen, Bookmark, Check, Download, ExternalLink, Hash,
  Info, Library, LockKeyhole, Pencil, Plus, Star, Tag, Trash2,
} from 'lucide-react';
import { Cover } from './LibraryDashboard';
import ThemeSwitcher from './ThemeSwitcher';
import QuickNavigation from './QuickNavigation';
import { useAppDialogs } from './AppDialogs';
import type { BookCollection } from '../lib/collections';
import BrandMark from './BrandMark';
import { novelHeroBackdrop, novelHeroBackdropUrl, novelHeroStyle } from '../lib/novel-hero';
import { libraryCollectionUrl } from '../lib/library-routes';
import './details-palettes.css';
import type { CloudSession } from '../lib/cloud';
import ChapterBrowser from './ChapterBrowser';
import DetailsScrollProgress from './DetailsScrollProgress';
import NovelCollectionPicker from './NovelCollectionPicker';
import { alphabeticalBookTags, normalisePersonalTags, suggestExistingTags, tagKey } from '../lib/tags';
import { ratingLabel, ratingSummary, ratingToneClass } from '../lib/ratings';
import './site-footer.css';
import { isFinished, isOngoingNovel, readingProgressLabel } from '../lib/reading-status';
import { publicationStatusDisplay, publicationStatusTone } from '../lib/publication-status';
import { openInternalLinkInCurrentTab, openNovelInCurrentTab, revealClippedLinkTitle } from '../lib/novel-links';
import type { ChapterItem, LibraryBook, ReaderTheme } from '../types';

interface Props {
  book: LibraryBook;
  availableTags: string[];
  theme: ReaderTheme;
  onThemeChange: (theme: ReaderTheme) => void;
  onBack: () => void;
  collections: BookCollection[];
  membershipPaths: Array<{ collection: BookCollection; path: string }>;
  onBrowseLibrary: (path: string) => void;
  onToggleCollection: (collectionId: string, include: boolean) => Promise<void>;
  onCreateCollectionForBook: (name: string, parentId?: string) => Promise<void>;
  onRead: () => void;
  readHref: string;
  onDownloadEpub: () => Promise<void>;
  isCachedOffline: boolean;
  onSaveOffline: () => void;
  onRemoveOffline: () => void;
  onDeleteLocal: () => void;
  onDownloadArchive?: () => Promise<void>;
  cloudConnected: boolean;
  cloudRepo: string;
  cloudSession: CloudSession | null;
  onReadChapter: (href: string) => void;
  onLoadChapters: () => Promise<ChapterItem[]>;
  onSaveTags: (tags: string[]) => Promise<void>;
  onSaveSummary: (summary: string) => Promise<void>;
  onSaveReview: (rating: number | undefined, review: string) => Promise<void>;
  onSetTrial: (trying: boolean) => Promise<void>;
  onBrowseTag: (tag: string) => void;
  onBrowseAuthor: (author: string) => void;
  onMarkCompleted: () => Promise<void>;
  error: string | null;
}

export default function BookDetails({ book, availableTags, theme, onThemeChange, onBack, collections, membershipPaths, onBrowseLibrary, onToggleCollection, onCreateCollectionForBook, onRead, readHref, onDownloadEpub, isCachedOffline, onSaveOffline, onRemoveOffline, onDeleteLocal, onDownloadArchive, cloudConnected, cloudRepo, cloudSession, onReadChapter, onLoadChapters, onSaveTags, onSaveSummary, onSaveReview, onSetTrial, onBrowseTag, onBrowseAuthor, onMarkCompleted, error }: Props) {
  const [tagInput, setTagInput] = useState('');
  const [tagDraft, setTagDraft] = useState<string[]>(() => book.personalTags || []);
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState(book.userDescription || book.description || '');
  const [ratingDraft, setRatingDraft] = useState<number | undefined>(book.personalRating);
  const [reviewDraft, setReviewDraft] = useState(book.personalReview || '');
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [markingCompleted, setMarkingCompleted] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showCollectionPicker, setShowCollectionPicker] = useState(false);
  const collectionTriggerRef = useRef<HTMLButtonElement>(null);
  const { confirm } = useAppDialogs();
  const originalTags = book.sourceTags || [];
  const customTags = tagDraft;
  const tagsChanged = JSON.stringify(tagDraft) !== JSON.stringify(book.personalTags || []);
  const allTags = alphabeticalBookTags(book);
  const existingTagSuggestions = suggestExistingTags(tagInput, availableTags);
  // React re-renders this A–Z list immediately on add, and again after save.
  const editableTags = alphabeticalBookTags({ sourceTags: originalTags, personalTags: tagDraft });
  const summary = book.userDescription || book.description;
  // Show a compact, language-neutral position instead of a possibly long
  // EPUB chapter title. Chapter names remain available in chapter navigation.
  const chapterText = book.currentChapterNumber
    ? `${book.currentChapterNumber.toLocaleString()} / ${book.chapterCount ? book.chapterCount.toLocaleString() : '?'}`
    : book.progress > 0 ? 'Position saved' : isFinished(book) ? 'Finished' : 'Not started';

  useEffect(() => { setSummaryDraft(book.userDescription || book.description || ''); }, [book.id, book.userDescription, book.description]);
  useEffect(() => { setShowCollectionPicker(false); }, [book.id]);
  useEffect(() => { setTagDraft(book.personalTags || []); setTagInput(''); }, [book.id, book.personalTags]);
  useEffect(() => { setRatingDraft(book.personalRating); setReviewDraft(book.personalReview || ''); }, [book.id, book.personalRating, book.personalReview]);

  function addTagValue(value: string) {
    const tag = normalisePersonalTags([value], availableTags)[0];
    if (!tag || saving) return;
    if ([...originalTags, ...tagDraft].some(existing => tagKey(existing) === tagKey(tag))) {
      setFeedback('That tag is already on this novel.'); setTagInput(''); return;
    }
    if (tagDraft.length >= 50) { setFeedback('Maximum 50 personal tags.'); return; }
    setTagDraft(current => [...current, tag]);
    setTagInput('');
    setFeedback('Tag added to your draft. Save changes after you finish editing.');
  }

  function addTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addTagValue(tagInput);
  }

  async function saveTags() {
    if (saving || !tagsChanged) return;
    if (!await confirm({ title: 'Save tag additions?', message: 'Add these personal tags to this novel? Existing tags will be preserved. To remove tags, use Master Controls.', confirmLabel: 'Save tags' })) return;
    setSaving(true); setFeedback(null);
    try {
      // The details page is add-only. Even a stale draft can never remove a
      // personal tag that is already saved; removal stays in Master Controls.
      const savedTags = book.personalTags || [];
      const additions = tagDraft.filter(tag => !savedTags.some(saved => tagKey(saved) === tagKey(tag)));
      await onSaveTags([...savedTags, ...additions]);
      setFeedback('Tag changes saved.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to save tag changes.');
    } finally { setSaving(false); }
  }

  async function saveSummary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!await confirm({ title: 'Save revised synopsis?', confirmLabel: 'Save synopsis' })) return;
    setSaving(true); setFeedback(null);
    try { await onSaveSummary(summaryDraft); setEditingSummary(false); setFeedback('Summary saved on this device.'); }
    catch { setFeedback('Could not save your summary.'); }
    finally { setSaving(false); }
  }

  function prepareArchive() {
    if (!onDownloadArchive || downloading) return;
    setDownloading(true); setFeedback(null);
    void onDownloadArchive().catch(reason => setFeedback(`ZIP download failed: ${String(reason)}`))
      .finally(() => setDownloading(false));
  }

  async function saveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setFeedback(null);
    try {
      await onSaveReview(ratingDraft, reviewDraft);
      setFeedback(cloudConnected && book.cloud
        ? 'Your rating and comments are saved to your private cloud library.'
        : 'Saved on this device. Connect your private cloud library to synchronise across devices.');
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save rating or comments.');
    } finally { setSaving(false); }
  }

  // The hero photograph is ambient scenery, separate from this novel's own cover.
  // Assignments are stable, use a vetted fixed set and reveal no novel metadata.
  const backdrop = novelHeroBackdrop(book.id);
  const [failedBackdropId, setFailedBackdropId] = useState<string | null>(null);

  return <div className={`details-shell theme-${theme}`}>
    <DetailsScrollProgress />
    <header className="details-topbar">
      <a className="details-brand-link" href="/" aria-label="Taiyou's Novel Library home" onClick={event => {
        // Preserve real link behaviour: middle-click, Ctrl/Cmd-click, and copy URL.
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onBack();
      }}>
        <BrandMark size={32} theme={theme} />
        <span className="details-brand-wordmark">
          <span className="details-brand-full">Taiyou's Novel Library</span>
          <span className="details-brand-short">Taiyou's Library</span>
        </span>
      </a>
      <QuickNavigation collections={collections} onNavigate={onBrowseLibrary} />
      <div className="details-top-controls"><ThemeSwitcher compact value={theme} onChange={onThemeChange} /></div>
    </header>
    <main className="details-layout">
      <div className={'details-hero details-hero-photographic' + (membershipPaths.length ? ' has-member-collections' : '')} style={novelHeroStyle(book.id)}>
        {failedBackdropId !== book.id && <img
          className="details-hero-backdrop"
          src={novelHeroBackdropUrl(backdrop.photoId)}
          srcSet={`${novelHeroBackdropUrl(backdrop.photoId, 840)} 840w, ${novelHeroBackdropUrl(backdrop.photoId, 1500)} 1500w`}
          sizes="(max-width: 700px) 100vw, 1200px"
          alt="" aria-hidden="true" loading="eager" decoding="async" draggable={false}
          referrerPolicy="no-referrer"
          style={{ objectPosition: backdrop.position }}
          onError={() => setFailedBackdropId(book.id)}
        />}
        {membershipPaths.length > 0 && <nav className="details-hero-memberships"
          aria-label="Collections containing this novel">
          <span className="details-hero-memberships-label"><Library size={14} aria-hidden="true" /> IN COLLECTIONS</span>
          {membershipPaths.map(({ collection, path }) => (
            <a key={collection.id} className="details-hero-membership"
              href={libraryCollectionUrl(collection.id)}
              aria-label={'Open collection ' + path}
              onMouseEnter={event => revealClippedLinkTitle(event, path)}
              onFocus={event => revealClippedLinkTitle(event, path)}
              onClick={event => openInternalLinkInCurrentTab(event,
                () => onBrowseLibrary(libraryCollectionUrl(collection.id)))}>
              {path}
            </a>
          ))}
        </nav>}
        <div className="details-cover-wrap"><Cover book={book} variant="feature" cloudRepo={cloudRepo} cloudSession={cloudSession} /></div>
        <div className="details-hero-content">
          <div className="details-hero-heading">
            <span className="details-eyebrow"><BookOpen size={15} /> NOVEL DETAILS</span>
            <h1>{book.title}</h1>
            <p className="details-byline">by <button type="button" className="details-author-link" onClick={() => onBrowseAuthor(book.author)} aria-label={`View novels by ${book.author}`}>{book.author}</button></p>
          </div>
          <div className="details-hero-facts">
            <div className="details-meta-row">
            <span><BookOpen size={16} /> {book.chapterCount ? `${book.chapterCount.toLocaleString()} chapters` : 'EPUB edition'}</span>
            {book.status && <span className={'publication-status ' + publicationStatusTone(book.status)}>{publicationStatusDisplay(book.status)}</span>}
            {book.language && <span>{book.language.toUpperCase()}</span>}
          </div>
            {allTags.length > 0 && <div className="details-hero-tags" aria-label="Novel tags">{allTags.map((tag) => <button type="button" key={tag} onClick={() => onBrowseTag(tag)} aria-label={`Browse novels tagged ${tag}`}>{tag}</button>)}</div>}
          </div>
          <form className="hero-rating" aria-label="Personal novel rating" onSubmit={(event) => void saveReview(event)}>
            <fieldset className="hero-rating-fieldset">
              <legend><Star size={15} fill="currentColor" aria-hidden="true" className={'rating-star ' + ratingToneClass(ratingDraft)} /> My rating {ratingSummary(book.personalRating) && <span className="hero-rating-saved">· {ratingSummary(book.personalRating)}</span>}</legend>
              <div className="hero-rating-choices">
                {Array.from({ length: 10 }, (_, index) => index + 1).map(value =>
                  <button key={value} type="button" className={ratingDraft === value ? 'hero-rating-choice selected' : 'hero-rating-choice'} onClick={() => setRatingDraft(value)} aria-label={`Rate ${value} out of 10: ${ratingLabel(value)}`} title={ratingLabel(value)} aria-pressed={ratingDraft === value}>{value}</button>
                )}
                <button type="button" className="hero-rating-clear" onClick={() => setRatingDraft(undefined)} disabled={ratingDraft === undefined}>Clear</button>
              </div>
            </fieldset>
            <button type="submit" className="hero-rating-save" disabled={saving}>Save rating</button>
          </form>
          <div className="details-hero-actions">
            <button type="button" className="details-trial-toggle" disabled={saving} onClick={() => {
              setSaving(true); setFeedback(null);
              void onSetTrial(book.shelfStatus !== 'trying')
                .then(() => setFeedback(book.shelfStatus === 'trying' ? 'Moved to your regular library.' : 'Added to Trying out.'))
                .catch(reason => setFeedback(String(reason instanceof Error ? reason.message : reason)))
                .finally(() => setSaving(false));
            }}>{book.shelfStatus === 'trying' ? 'Move to regular library' : 'Add to Trying out'}</button>
            <a href={readHref} className="details-start" onClick={event => openNovelInCurrentTab(event, onRead)}>{book.progress > 0 ? 'Continue reading' : 'Start reading'} <ArrowRight size={20} /></a>
            <button type="button" className="details-download" disabled={downloading} onClick={() => {
              setDownloading(true); setFeedback(null);
              void onDownloadEpub().catch(reason => setFeedback(`Download failed: ${String(reason)}`)).finally(() => setDownloading(false));
            }}><Download size={17} /> {downloading ? 'Preparing…' : 'Download EPUB'}</button>
            <button ref={collectionTriggerRef} type="button" className="details-add-collection" onClick={() => setShowCollectionPicker(true)}>
              <Plus size={16} aria-hidden="true" /> Add to collection
            </button>
          </div>
        </div>
      </div>

      {showCollectionPicker && <NovelCollectionPicker bookTitle={book.title} bookId={book.id} theme={theme}
        collections={collections} onToggle={onToggleCollection} onCreate={onCreateCollectionForBook}
        onClose={() => {
          setShowCollectionPicker(false);
          window.requestAnimationFrame(() => collectionTriggerRef.current?.focus());
        }} />}
      {error && <div className="alert error-alert" role="alert">{error}</div>}
      {feedback && <p className="details-feedback" role="status">{feedback}</p>}

      <div className="details-columns">
        <aside className="details-aside">
          <section className="details-card details-progress-card" aria-label="Reading progress"><div className="details-section-header"><div><span className="details-label">YOUR JOURNEY</span><h2>Reading progress</h2></div><Bookmark size={20} className="details-section-icon" /></div>
            <div className="details-percent">{Math.round(book.progress)}<span>%</span></div>
            <div className="details-progress-track"><i style={{ width: `${Math.max(0, Math.min(book.progress, 100))}%` }} /></div>
            <div className="details-progress-status">{readingProgressLabel(book)}</div>
            <div className="details-location"><span>{book.currentChapterNumber ? 'Chapter' : 'Last reading position'}</span><strong>{chapterText}</strong></div>
            <a href={readHref} className="details-resume" onClick={event => openNovelInCurrentTab(event, onRead)}>{book.progress > 0 ? 'Resume at saved position' : 'Begin this novel'} <ArrowRight size={17} /></a>
            {!isOngoingNovel(book) && !isFinished(book) && <button type="button" className="details-mark-completed" disabled={markingCompleted}
              onClick={() => {
                void (async () => {
                  if (!await confirm({ title: 'Mark as completed?', message: '“' + book.title + '”', confirmLabel: 'Mark completed' })) return;
                setMarkingCompleted(true); setFeedback(null);
                void onMarkCompleted().then(() => setFeedback('Novel marked as completed and moved to Finished.'))
                  .catch(reason => setFeedback(String(reason)))
                  .finally(() => setMarkingCompleted(false));
                })();
              }}><Check size={15}/> {markingCompleted ? 'Saving…' : 'Mark as completed'}</button>}
          </section>
          <section className="details-card details-info-card"><div className="details-section-header"><div><span className="details-label">BOOK INFORMATION</span><h2>Details</h2></div><Info size={20} className="details-section-icon" /></div>
            <dl><div><dt>Author</dt><dd><button type="button" className="details-info-author-link" onClick={() => onBrowseAuthor(book.author)} aria-label={`View novels by ${book.author}`}>{book.author}</button></dd></div><div><dt>Chapters</dt><dd>{book.chapterCount ? book.chapterCount.toLocaleString() : 'Unknown'}</dd></div><div><dt>Language</dt><dd>{book.language?.toUpperCase() || 'Not supplied'}</dd></div>{book.status && <div><dt>Status</dt><dd>{book.status}</dd></div>}<div><dt>Personal tags</dt><dd>{customTags.length}</dd></div>{book.sourceUrl && <div><dt>Original source</dt><dd><a href={book.sourceUrl} target="_blank" rel="noopener noreferrer">Open original <ExternalLink size={13} /></a></dd></div>}</dl>
          </section>
          <section className="details-card details-tags-card" aria-labelledby="detail-tags-heading">
            <div className="details-section-header"><div><span className="details-label">ORGANISE YOUR READING</span><h2 id="detail-tags-heading">Tags & genres</h2></div><Tag size={20} className="details-section-icon" /></div>
            <p className="details-help">Browse all tags together and add personal tags here. To remove personal tags, use Master Controls. Imported genres are protected.</p>
            <div className="details-tag-row" aria-label="All novel tags">{editableTags.length ? editableTags.map((tag) =>
              <button type="button" className="details-tag tag-browse" key={tag} onClick={() => onBrowseTag(tag)}
                aria-label={`Browse novels tagged ${tag}`}><Hash size={13} aria-hidden="true" />{tag}</button>
            ) : <span className="details-muted small">No tags yet. Add one below.</span>}</div>
            <form className="details-tag-form" onSubmit={(e) => void addTag(e)}><label htmlFor="new-novel-tag" className="sr-only">New personal tag</label><input id="new-novel-tag" value={tagInput} maxLength={45} onChange={(e) => setTagInput(e.target.value)} placeholder="e.g. Favourite, Cultivation, Slow burn..." /><button className="primary-button" type="submit" disabled={saving || !tagInput.trim() || customTags.length >= 50}><Plus size={18} /> Add tag</button></form>
            {existingTagSuggestions.length > 0 && <div className="details-tag-suggestions" role="group" aria-label="Suggested existing tags">
              <span>Existing tags: select one to avoid duplicates</span>
              <div>{existingTagSuggestions.map(candidate => {
                const alreadyAdded = [...originalTags, ...tagDraft].some(label => tagKey(label) === tagKey(candidate));
                return <button type="button" key={candidate} disabled={saving || alreadyAdded}
                  title={alreadyAdded ? 'Already on this novel' : 'Add existing tag ' + candidate}
                  onClick={() => addTagValue(candidate)}>{candidate}{alreadyAdded ? ' ✓' : ''}</button>;
              })}</div>
            </div>}
            <div className="tag-draft-actions">
              <span>{tagsChanged ? 'Unsaved tag changes' : 'Your tags are saved'}</span>
              {tagsChanged && <><button type="button" className="secondary-button" onClick={() => { setTagDraft(book.personalTags || []); setFeedback(null); }}>Discard changes</button>
                <button type="button" className="primary-button" disabled={saving} onClick={() => void saveTags()}>Review & save tags</button></>}
            </div>
          </section>
          <section className="details-card details-review-card" aria-labelledby="detail-review-heading">
            <div className="details-section-header"><div><span className="details-label">YOUR PERSONAL IMPRESSIONS</span><h2 id="detail-review-heading">Comments & reading notes</h2></div><Star size={20} className="details-section-icon" /></div>
            <p className="details-help">Capture your thoughts about this novel. When connected, your private ratings and comments are synchronised across devices without changing the shared novel catalogue.</p>
            <form className="personal-review-form" onSubmit={(event) => void saveReview(event)}>
              <label htmlFor="personal-review">My comments / reading notes</label>
              <textarea id="personal-review" rows={5} maxLength={10000} value={reviewDraft} onChange={event => setReviewDraft(event.target.value)} placeholder="Memorable characters, plot points, or your thoughts..." />
              <div className="personal-review-actions"><span>{cloudConnected && book.cloud ? 'Stored in your private cloud library' : 'Saved locally until cloud is connected'}</span><button type="submit" className="primary-button" disabled={saving}><Check size={16} /> Save comments</button></div>
            </form>
          </section>

          <section className="details-card details-management-card" aria-label="Manage this novel">
            <div className="details-section-header"><div><span className="details-label">BOOK STORAGE</span><h2>Manage this novel</h2></div><LockKeyhole size={19} className="details-section-icon" /></div>
            <p className="details-help">Offline downloads are stored only in this browser. Your private cloud data and reading progress are separate.</p>
            <div className="details-management-actions">
              {isCachedOffline
                ? book.cloud
                  ? <button type="button" className="secondary-button" onClick={onRemoveOffline}><Download size={15} /> Remove offline EPUB</button>
                  : <span className="details-muted small">Local-only EPUB. Export a backup before removing this novel.</span>
                : <button type="button" className="secondary-button" onClick={onSaveOffline}><Download size={15} /> Save for offline reading</button>}
              {onDownloadArchive && <details className="details-archive-tools">
                <summary>Original ZIP backup (advanced)</summary>
                <p className="details-help">This is the original uploaded archive. For normal reading and offline use, choose EPUB.</p>
                <button type="button" className="secondary-button" disabled={downloading} onClick={prepareArchive}><Download size={15} /> Download original ZIP</button>
              </details>}
              <button type="button" className="details-delete-novel" onClick={onDeleteLocal}><Trash2 size={15} />
                 {book.cloud ? 'Delete novel from library (Owner mode)' : 'Remove local novel (Owner mode)'}
               </button>
            </div>
            {book.cloud && <p className="details-help">Protected deletion removes this novel's private cloud files, catalogue entry, reading position and notes. Download a backup first. Other novels are unaffected.</p>}
          </section>
        </aside>
        <section className="details-card details-mobile-rating" aria-label="Personal novel rating on mobile">
          <div className="details-mobile-rating-label"><Star size={16} fill="currentColor" className={ratingToneClass(ratingDraft)} aria-hidden="true" />
            <span>My rating</span>
            {ratingSummary(ratingDraft) && <strong aria-live="polite">{ratingSummary(ratingDraft)}</strong>}
          </div>
          <form className="details-mobile-rating-controls" onSubmit={(event) => void saveReview(event)}>
            <label htmlFor="mobile-novel-rating" className="sr-only">Rate this novel</label>
            <select id="mobile-novel-rating" aria-label="Rate this novel"
              value={ratingDraft ?? ''} onChange={event =>
                setRatingDraft(event.target.value ? Number(event.target.value) : undefined)}>
              <option value="">Unrated</option>
              {Array.from({ length: 10 }, (_, index) => index + 1).map(value =>
                <option value={value} key={value}>{ratingSummary(value)}</option>)}
            </select>
            <button type="submit" className="hero-rating-save" disabled={saving}>Save rating</button>
          </form>
        </section>
        <div className="details-main-column">
          <section className="details-card details-description" aria-labelledby="detail-summary-heading">
            <div className="details-section-header"><div><span className="details-label">ABOUT THE STORY</span><h2 id="detail-summary-heading">Synopsis</h2></div><button className="details-text-action" onClick={() => { if (editingSummary) setSummaryDraft(book.userDescription || book.description || ''); setEditingSummary(!editingSummary); }} type="button"><Pencil size={15} /> {editingSummary ? 'Cancel' : 'Edit summary'}</button></div>
            {editingSummary ? <form onSubmit={(e) => void saveSummary(e)} className="summary-form"><label htmlFor="summary-editor" className="setting-help">Your version is stored only in this browser; the imported summary remains available.</label><textarea id="summary-editor" value={summaryDraft} onChange={(e) => setSummaryDraft(e.target.value)} maxLength={24000} rows={9} placeholder="Write a short summary of the story..." /><div className="summary-form-actions"><button type="button" className="secondary-button" onClick={() => setEditingSummary(false)}>Cancel</button><button type="submit" className="primary-button" disabled={saving}><Check size={16} /> Save summary</button></div></form>
              : summary ? <p className="details-synopsis" role="region" aria-label="Novel synopsis text" tabIndex={0}>{summary}</p>
                : <p className="details-muted">No synopsis is present in this EPUB. You can add your own with <strong>Edit summary</strong>.</p>}
          </section>

          <ChapterBrowser book={book} onReadChapter={onReadChapter} onLoadChapters={onLoadChapters} />


        </div>
      </div>
    </main>
    <footer className="site-credit-footer">© {new Date().getFullYear()} Taiyou's Novel Library <span aria-hidden="true">·</span> Created by Taiyou</footer>
  </div>;
}
