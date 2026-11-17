import { describe, expect, it } from 'vitest';
import { mergeCollections, validateCollections, collectionChildren, collectionAncestors, collectionTree, collectionDescendantIds, moveCollection, deleteCollectionPreservingChildren, type BookCollection } from './collections';

const base: BookCollection = { id: 'collection_12345', name: 'Harry Potter', bookIds: ['aaaaaaaaaaaaaaaaaaaaaaaa'], updatedAt: 100 };

describe('personal collections', () => {
  it('keeps collection names separate from genres and validates membership', () => {
    expect(validateCollections({ version: 1, collections: [base] })).toEqual([base]);
  });
  it('rejects invalid book IDs or duplicate collection IDs', () => {
    expect(() => validateCollections({ version: 1, collections: [{ ...base, bookIds: ['not-an-epub-id'] }] })).toThrow();
    expect(() => validateCollections({ version: 1, collections: [base, base] })).toThrow();
  });
  it('merges independent collections without losing either one', () => {
    const second: BookCollection = { id: 'collection_67890', name: 'Another Series', bookIds: [], updatedAt: 101 };
    expect(mergeCollections([base], [second])).toHaveLength(2);
  });
  it('prefers a later membership edit and preserves deletion tombstones', () => {
    const edited = { ...base, bookIds: [...base.bookIds, 'bbbbbbbbbbbbbbbbbbbbbbbb'], updatedAt: 200 };
    expect(mergeCollections([base], [edited])).toEqual([edited]);
    const removed = { ...base, deleted: true, updatedAt: 250 };
    expect(mergeCollections([edited], [removed])).toEqual([removed]);
  });
  it('deduplicates novel memberships without disturbing names', () => {
    expect(validateCollections({ version: 1, collections: [{ ...base, bookIds: [...base.bookIds, ...base.bookIds] }] })[0].bookIds).toHaveLength(1);
  });
});

describe('nested personal collections', () => {
  const root: BookCollection = { id: 'parent_alpha_1', name: 'Cultivation', bookIds: ['aaaaaaaaaaaaaaaaaaaaaaaa'], updatedAt: 100 };
  const child: BookCollection = { id: 'child_alpha_12', name: 'Xianxia', bookIds: ['bbbbbbbbbbbbbbbbbbbbbbbb'], parentId: root.id, updatedAt: 110 };
  const grandchild: BookCollection = { id: 'grandchild_123', name: 'Sect novels', bookIds: [], parentId: child.id, updatedAt: 120 };
  const other: BookCollection = { id: 'other_parent1', name: 'Fantasy', bookIds: [], updatedAt: 130 };

  it('reads legacy flat collections and round-trips parentId in the existing v1 format', () => {
    expect(validateCollections({ version:1, collections:[base] })[0].parentId).toBeUndefined();
    const nested = validateCollections({ version:1, collections:[root,child,grandchild] });
    expect(nested[1].parentId).toBe(root.id);
    expect(nested[2].parentId).toBe(child.id);
    expect(nested[0].bookIds).toEqual(['aaaaaaaaaaaaaaaaaaaaaaaa']);
  });

  it('shows root, children and breadcrumbs in deterministic hierarchy order', () => {
    const collections = [grandchild,child,other,root];
    expect(collectionChildren(collections).map(c=>c.name)).toEqual(['Cultivation','Fantasy']);
    expect(collectionChildren(collections,root.id)).toEqual([child]);
    expect(collectionAncestors(collections,grandchild.id).map(c=>c.name))
      .toEqual(['Cultivation','Xianxia','Sect novels']);
    expect(collectionTree(collections).map(item=>[item.collection.name,item.depth]))
      .toEqual([['Cultivation',0],['Xianxia',1],['Sect novels',2],['Fantasy',0]]);
    expect(collectionDescendantIds(collections,root.id)).toEqual(new Set([child.id,grandchild.id]));
  });

  it('moves collections into another parent or back to the top, without losing memberships', () => {
    const original = [root,child,grandchild,other];
    const nested = moveCollection(original, other.id, root.id, 140);
    expect(nested.find(c => c.id === other.id)?.parentId).toBe(root.id);
    expect(nested.find(c => c.id === other.id)?.bookIds).toEqual([]);
    const detached = moveCollection(nested, child.id, null, 150);
    expect(detached.find(c => c.id === child.id)?.parentId).toBeUndefined();
    expect(detached.find(c => c.id === grandchild.id)?.parentId).toBe(child.id);
    expect(original[1].parentId).toBe(root.id);
  });

  it('blocks self-parenting, descendant-parenting and unknown parents', () => {
    const original = [root,child,grandchild];
    expect(() => moveCollection(original,root.id,root.id)).toThrow(/cannot be moved/);
    expect(() => moveCollection(original,root.id,grandchild.id)).toThrow(/cannot be moved/);
    expect(() => moveCollection(original,root.id,'missing_parent_1')).toThrow(/no longer exists/);
    expect(() => validateCollections({ version:1, collections:[{ ...root,parentId:root.id }] })).toThrow();
    expect(() => validateCollections({ version:1, collections:[
      { ...root,parentId:child.id },child,
    ] })).toThrow(/cycle/);
  });

  it('never deletes nested children or their books when deleting a parent', () => {
    const result = deleteCollectionPreservingChildren([root,child,grandchild,other],root.id,300);
    expect(result.find(c=>c.id===root.id)?.deleted).toBe(true);
    expect(result.find(c=>c.id===child.id)?.parentId).toBeUndefined();
    expect(result.find(c=>c.id===grandchild.id)?.parentId).toBe(child.id);
    expect(result.find(c=>c.id===child.id)?.bookIds).toEqual(child.bookIds);
    expect(collectionTree(result).map(item=>item.collection.name))
      .toEqual(['Fantasy','Xianxia','Sect novels']);
    expect(deleteCollectionPreservingChildren(result,root.id,400)).toEqual(result);
  });

  it('adopts children into the grandparent when deleting a middle collection', () => {
    const result = deleteCollectionPreservingChildren([root,child,grandchild],child.id,400);
    expect(result.find(c=>c.id===grandchild.id)?.parentId).toBe(root.id);
    expect(collectionChildren(result,root.id)).toEqual([result.find(c=>c.id===grandchild.id)]);
  });

  it('retains parent placement through cloud merge and rejects conflicting device cycles', () => {
    const upgraded = { ...child, parentId:other.id, updatedAt:240 };
    expect(mergeCollections([root,child,other], [upgraded]).find(c=>c.id===child.id)?.parentId)
      .toBe(other.id);
    const remoteA = { ...root, parentId:other.id, updatedAt:300 };
    const localB = { ...other, parentId:root.id, updatedAt:301 };
    expect(() => mergeCollections([remoteA,other], [root,localB])).toThrow(/cycle/);
  });

  it('renders legacy orphaned records at the top level without losing data', () => {
    const orphan = { ...child, parentId:'deleted_parent_1' };
    expect(collectionChildren([orphan])).toEqual([orphan]);
    expect(collectionTree([orphan]).map(x=>x.collection.id)).toEqual([orphan.id]);
    expect(validateCollections({version:1, collections:[orphan]})).toHaveLength(1);
  });
});
