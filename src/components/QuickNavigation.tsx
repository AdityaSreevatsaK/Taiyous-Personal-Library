import { useMemo, useState, type CSSProperties } from 'react';
import { ChevronDown, Library, Search } from 'lucide-react';
import type { BookCollection } from '../lib/collections';
import { libraryCollectionUrl, libraryShelfUrl } from '../lib/library-routes';
import { openInternalLinkInCurrentTab } from '../lib/novel-links';
import './quick-navigation.css';

type NavigationProps = {
  collections: BookCollection[];
  onNavigate: (path: string) => void;
  compact?: boolean;
};

export default function QuickNavigation({ collections, onNavigate, compact = false }: NavigationProps) {
  const [expanded, setExpanded] = useState(false);
  // Only calculate or mount the collection hierarchy when the menu is opened.
  const items = useMemo(() => {
    if (!expanded) return [] as Array<{ collection: BookCollection; depth: number }>;
    const byParent = new Map<string, BookCollection[]>();
    const known = new Set(collections.map(collection => collection.id));
    const active = collections.filter(collection => !collection.deleted);
    for (const collection of active) {
      const parentId = (collection as BookCollection & { parentId?: string | null }).parentId;
      const key = parentId && known.has(parentId) && parentId !== collection.id ? parentId : '';
      const group = byParent.get(key) || [];
      group.push(collection); byParent.set(key, group);
    }
    for (const group of byParent.values())
      group.sort((a, b) => a.name.localeCompare(b.name));
    const result: Array<{ collection: BookCollection; depth: number }> = [];
    const visited = new Set<string>();
    const walk = (parentId: string, depth: number) => {
      for (const collection of byParent.get(parentId) || []) {
        if (visited.has(collection.id)) continue;
        visited.add(collection.id);
        result.push({ collection, depth });
        walk(collection.id, depth + 1);
      }
    };
    walk('', 0);
    // Inconsistent historical parents or cycles must never make collections vanish.
    for (const collection of active) if (!visited.has(collection.id)) {
      result.push({ collection, depth: 0 });
      walk(collection.id, 1);
    }
    return result;
  }, [collections, expanded]);

  const readingPath = libraryShelfUrl('reading');
  const allPath = libraryShelfUrl('all');
  const open = (path: string) => {
    setExpanded(false);
    onNavigate(path);
  };
  const collectionLinks = () => items.length
    ? items.map(({collection, depth}) => <a key={collection.id}
        href={libraryCollectionUrl(collection.id)} className="quick-nav-collection-link"
        style={{ paddingLeft: Math.min(depth, 7) * 15 + 12 } as CSSProperties}
        aria-label={'Open collection ' + collection.name}
        onClick={event => openInternalLinkInCurrentTab(event, () => open(libraryCollectionUrl(collection.id)))}>
        <span>{collection.name}</span><small>{collection.bookIds.length}</small>
      </a>)
    : <p className="quick-nav-empty">No collections yet</p>;

  return <nav className={'quick-nav' + (compact ? ' quick-nav--compact' : '')}
    aria-label="Navigate library">
    <div className="quick-nav-primary">
      <a href={readingPath} onClick={event => openInternalLinkInCurrentTab(event, () => open(readingPath))}>Currently reading</a>
      <a href={allPath} onClick={event => openInternalLinkInCurrentTab(event, () => open(allPath))}>All novels</a>
      <details className="quick-nav-dropdown-host" onToggle={event => setExpanded(event.currentTarget.open)}>
        <summary><Library size={15}/> Collections <ChevronDown size={13}/></summary>
        {expanded && <div className="quick-nav-popover" role="group" aria-label="Collections and subcollections">
          <strong>YOUR COLLECTIONS</strong>{collectionLinks()}
        </div>}
      </details>
      <a href="/advanced-search" className="quick-nav-search"
        onClick={event => openInternalLinkInCurrentTab(event, () => open('/advanced-search'))}><Search size={16}/> Search</a>
    </div>
    <details className="quick-nav-mobile" onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary aria-label="Open library navigation"><Library size={17}/><span>Library</span><ChevronDown size={13}/></summary>
      {expanded && <div className="quick-nav-popover" role="group" aria-label="Library shortcuts">
        <a href="/" onClick={event => openInternalLinkInCurrentTab(event, () => open('/'))}>Home</a>
        <a href={readingPath} onClick={event => openInternalLinkInCurrentTab(event, () => open(readingPath))}>Currently reading</a>
        <a href={allPath} onClick={event => openInternalLinkInCurrentTab(event, () => open(allPath))}>All novels</a>
        <a href="/advanced-search" onClick={event => openInternalLinkInCurrentTab(event, () => open('/advanced-search'))}><Search size={15}/> Search library</a>
        <strong>COLLECTIONS</strong>{collectionLinks()}
      </div>}
    </details>
  </nav>;
}
