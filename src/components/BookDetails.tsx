import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft, ArrowRight, BookOpen, Bookmark, Check, Download, ExternalLink, Hash,
  Info, Pencil, Plus, Star, Tag, X,
} from 'lucide-react';
import { Cover } from './LibraryDashboard';
import type { CloudSession } from '../lib/cloud';
import ChapterBrowser from './ChapterBrowser';
import { bookTags, includesTag, normalizeTags } from '../lib/tags';
import type { LibraryBook, ReaderTheme } from '../types';

interface Props {
  book: LibraryBook;
  theme: ReaderTheme;
  onBack: () => void;
  onRead: () => void;
  onDownloadEpub: () => Promise<void>;
  onDownloadArchive?: () => Promise<void>;
  cloudConnected: boolean;
  cloudRepo: string;
  cloudSession: CloudSession | null;
  onReadChapter: (href: string) => void;
  onSaveTags: (tags: string[]) => Promise<void>;
  onSaveSummary: (summary: string) => Promise<void>;
  onSaveReview: (rating: number | undefined, review: string) => Promise<void>;
  onBrowseTag: (tag: string) => void;
  error: string | null;
}

export default function BookDetails({ book, theme, onBack, onRead, onDownloadEpub, onDownloadArchive, cloudConnected, cloudRepo, cloudSession, onReadChapter, onSaveTags, onSaveSummary, onSaveReview, onBrowseTag, error }: Props) {
  const [tagInput, setTagInput] = useState('');
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState(book.userDescription || book.description || '');
  const [ratingDraft, setRatingDraft] = useState<number | undefined>(book.personalRating);
  const [reviewDraft, setReviewDraft] = useState(book.personalReview || '');
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const originalTags = book.sourceTags || [];
  const customTags = book.personalTags || [];
  const allTags = bookTags(book);
  const summary = book.userDescription || book.description;
  const chapterText = book.currentChapter || (book.progress ? 'Position saved' : 'Not started');

  useEffect(() => { setSummaryDraft(book.userDescription || book.description || ''); }, [book.id, book.userDescription, book.description]);
  useEffect(() => { setRatingDraft(book.personalRating); setReviewDraft(book.personalReview || ''); }, [book.id, book.personalRating, book.personalReview]);

  async function addTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tag = normalizeTags(tagInput)[0];
    if (!tag || saving) return;
    if (includesTag(book, tag)) { setFeedback('That tag is already on this novel.'); setTagInput(''); return; }
    setSaving(true); setFeedback(null);
    try {
      await onSaveTags([...customTags, tag]);
      setTagInput('');
      setFeedback(`Added “${tag}”.`);
    } catch { setFeedback('Unable to save this tag. Check browser storage.'); }
    finally { setSaving(false); }
  }

  async function removeTag(tag: string) {
    if (saving) return;
    setSaving(true); setFeedback(null);
    try {
      await onSaveTags(customTags.filter((existing) => existing.toLocaleLowerCase() !== tag.toLocaleLowerCase()));
      setFeedback(`Removed “${tag}”.`);
    } catch { setFeedback('Unable to remove the tag.'); }
    finally { setSaving(false); }
  }

  async function saveSummary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setFeedback(null);
    try { await onSaveSummary(summaryDraft); setEditingSummary(false); setFeedback('Summary saved on this device.'); }
    catch { setFeedback('Could not save your summary.'); }
    finally { setSaving(false); }
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

  return <div className={`details-shell theme-${theme}`}>
    <header className="details-topbar">
      <button className="details-back" type="button" onClick={onBack}><ArrowLeft size={18} /> <span>My library</span></button>
      <span className="details-top-title">Taiyou's Personal Library</span>
      <button className="details-top-read" type="button" onClick={onRead}>Read <ArrowRight size={17} /></button>
    </header>
    <main className="details-layout">
      <div className="details-hero">
        <div className="details-cover-wrap"><Cover book={book} variant="feature" cloudRepo={cloudRepo} cloudSession={cloudSession} /></div>
        <div className="details-hero-content">
          <span className="details-eyebrow"><BookOpen size={15} /> NOVEL DETAILS</span>
          <h1>{book.title}</h1>
          <p className="details-byline">by <strong>{book.author}</strong></p>
          <div className="details-meta-row">
            <span><BookOpen size={16} /> {book.chapterCount ? `${book.chapterCount.toLocaleString()} chapters` : 'EPUB edition'}</span>
            {book.status && <span><Check size={16} /> {book.status}</span>}
            {book.language && <span>{book.language.toUpperCase()}</span>}
          </div>
          {allTags.length > 0 && <div className="details-hero-tags" aria-label="Novel tags">{allTags.slice(0, 9).map((tag) => <button type="button" key={tag} onClick={() => onBrowseTag(tag)} aria-label={`Browse novels tagged ${tag}`}>{tag}</button>)}</div>}
          <form className="hero-rating" aria-label="Personal novel rating" onSubmit={(event) => void saveReview(event)}>
            <fieldset className="hero-rating-fieldset">
              <legend><Star size={15} /> My rating {book.personalRating ? `· ${book.personalRating}/10` : '· Not rated'}</legend>
              <div className="hero-rating-choices">
                {Array.from({ length: 10 }, (_, index) => index + 1).map(value =>
                  <button key={value} type="button" className={ratingDraft === value ? 'hero-rating-choice selected' : 'hero-rating-choice'} onClick={() => setRatingDraft(value)} aria-label={`Rate ${value} out of 10`} aria-pressed={ratingDraft === value}>{value}</button>
                )}
                <button type="button" className="hero-rating-clear" onClick={() => setRatingDraft(undefined)} disabled={ratingDraft === undefined}>Clear</button>
              </div>
            </fieldset>
            <button type="submit" className="hero-rating-save" disabled={saving}>Save rating</button>
          </form>
          <div className="details-hero-actions">
            <button type="button" className="details-start" onClick={onRead}>{book.progress > 0 ? 'Continue reading' : 'Start reading'} <ArrowRight size={20} /></button>
            <button type="button" className="details-download" disabled={downloading} onClick={() => {
              setDownloading(true); setFeedback(null);
              void onDownloadEpub().catch(reason => setFeedback(`Download failed: ${String(reason)}`)).finally(() => setDownloading(false));
            }}><Download size={17} /> {downloading ? 'Preparing…' : 'Download EPUB'}</button>
            {onDownloadArchive && <button type="button" className="details-download" disabled={downloading} onClick={() => {
              setDownloading(true); setFeedback(null);
              void onDownloadArchive().catch(reason => setFeedback(`ZIP download failed: ${String(reason)}`)).finally(() => setDownloading(false));
            }}><Download size={17} /> Original ZIP</button>}
          </div>
        </div>
      </div>

      {error && <div className="alert error-alert" role="alert">{error}</div>}
      {feedback && <p className="details-feedback" role="status">{feedback}</p>}

      <div className="details-columns">
        <aside className="details-aside">
          <section className="details-card details-progress-card" aria-label="Reading progress"><div className="details-section-header"><div><span className="details-label">YOUR JOURNEY</span><h2>Reading progress</h2></div><Bookmark size={20} className="details-section-icon" /></div>
            <div className="details-percent">{Math.round(book.progress)}<span>%</span></div>
            <div className="details-progress-track"><i style={{ width: `${Math.max(0, Math.min(book.progress, 100))}%` }} /></div>
            <div className="details-progress-status">{book.progress <= 0 ? 'Not started' : book.progress >= 99.5 ? 'Finished' : 'Currently reading'}</div>
            <div className="details-location"><span>Last reading position</span><strong>{chapterText}</strong>{book.currentChapterNumber && <small>Chapter {book.currentChapterNumber}{book.chapterCount ? ` of ${book.chapterCount}` : ''}</small>}</div>
            <button type="button" className="details-resume" onClick={onRead}>{book.progress > 0 ? 'Resume at saved position' : 'Begin this novel'} <ArrowRight size={17} /></button>
          </section>
          <section className="details-card details-info-card"><div className="details-section-header"><div><span className="details-label">BOOK INFORMATION</span><h2>Details</h2></div><Info size={20} className="details-section-icon" /></div>
            <dl><div><dt>Author</dt><dd>{book.author}</dd></div><div><dt>Chapters</dt><dd>{book.chapterCount ? book.chapterCount.toLocaleString() : 'Unknown'}</dd></div><div><dt>Language</dt><dd>{book.language?.toUpperCase() || 'Not supplied'}</dd></div>{book.status && <div><dt>Status</dt><dd>{book.status}</dd></div>}<div><dt>Personal tags</dt><dd>{customTags.length}</dd></div>{book.sourceUrl && <div><dt>Original source</dt><dd><a href={book.sourceUrl} target="_blank" rel="noopener noreferrer">Open original <ExternalLink size={13} /></a></dd></div>}</dl>
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

        </aside>
        <div className="details-main-column">
          <section className="details-card details-description" aria-labelledby="detail-summary-heading">
            <div className="details-section-header"><div><span className="details-label">ABOUT THE STORY</span><h2 id="detail-summary-heading">Synopsis</h2></div><button className="details-text-action" onClick={() => setEditingSummary(!editingSummary)} type="button"><Pencil size={15} /> {editingSummary ? 'Cancel' : 'Edit summary'}</button></div>
            {editingSummary ? <form onSubmit={(e) => void saveSummary(e)} className="summary-form"><label htmlFor="summary-editor" className="setting-help">Your version is stored only in this browser; the imported summary remains available.</label><textarea id="summary-editor" value={summaryDraft} onChange={(e) => setSummaryDraft(e.target.value)} maxLength={24000} rows={9} placeholder="Write a short summary of the story..." /><div className="summary-form-actions"><button type="button" className="secondary-button" onClick={() => setEditingSummary(false)}>Cancel</button><button type="submit" className="primary-button" disabled={saving}><Check size={16} /> Save summary</button></div></form>
              : summary ? <p className="details-synopsis">{summary}</p>
                : <p className="details-muted">No synopsis is present in this EPUB. You can add your own with <strong>Edit summary</strong>.</p>}
          </section>

          <ChapterBrowser book={book} onReadChapter={onReadChapter} />

          <section className="details-card" aria-labelledby="detail-tags-heading">
            <div className="details-section-header"><div><span className="details-label">ORGANISE YOUR READING</span><h2 id="detail-tags-heading">Tags & genres</h2></div><Tag size={20} className="details-section-icon" /></div>
            <p className="details-help">Imported genres are taken from the EPUB or source metadata. Add your own tags to organise your library.</p>
            <h3 className="details-tags-label">Imported genres</h3>
            <div className="details-tag-row">{originalTags.length ? originalTags.map((tag) => <button type="button" className="details-tag imported-tag" key={tag} onClick={() => onBrowseTag(tag)} aria-label={`Browse novels tagged ${tag}`}><Hash size={13} />{tag}</button>) : <span className="details-muted small">No imported genres found.</span>}</div>
            <h3 className="details-tags-label">My tags</h3>
            <div className="details-tag-row">{customTags.length ? customTags.map((tag) => <span className="details-tag personal-tag" key={tag}><button className="tag-browse-button" type="button" onClick={() => onBrowseTag(tag)} aria-label={`Browse novels tagged ${tag}`}>{tag}</button><button type="button" disabled={saving} onClick={() => void removeTag(tag)} title={`Remove ${tag}`} aria-label={`Remove tag ${tag}`}><X size={14} /></button></span>) : <span className="details-muted small">You haven't added any personal tags yet.</span>}</div>
            <form className="details-tag-form" onSubmit={(e) => void addTag(e)}><label htmlFor="new-novel-tag" className="sr-only">New personal tag</label><input id="new-novel-tag" value={tagInput} maxLength={45} onChange={(e) => setTagInput(e.target.value)} placeholder="e.g. Favourite, Cultivation, Slow burn..." /><button className="primary-button" type="submit" disabled={saving || !tagInput.trim() || customTags.length >= 50}><Plus size={18} /> Add tag</button></form>
          </section>
        </div>
      </div>
    </main>
  </div>;
}
