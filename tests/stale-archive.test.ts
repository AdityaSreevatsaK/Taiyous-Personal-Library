import { describe, expect, it } from 'vitest';
import { staleMetadataCandidates } from '../src/lib/stale-archive';
import type { LibraryBook } from '../src/types';
const record=(id:string, cloud:boolean):LibraryBook=>({
  id,title:'Abe the Wizard',author:'Writer',originalFileName:'book.epub',
  importedAt:1,progress:37,cloud,size:50,personalRating:9,
  personalReview:'Preserve my notes',pendingProgressSync:true,
});
describe('safe stale archive selection',()=>{
  it('excludes both live hosted entries and local-only cached EPUBs',()=>{
    const hosted=record('aaaaaaaaaaaaaaaaaaaaaaaa',true);
    const cached=record('bbbbbbbbbbbbbbbbbbbbbbbb',false);
    const stale=record('cccccccccccccccccccccccc',true);
    expect(staleMetadataCandidates([hosted,cached,stale],[hosted.id],[cached.id])).toEqual([stale]);
  });
  it('preserves original records including unsynced private fields',()=>{
    const stale=record('cccccccccccccccccccccccc',true);
    const result=staleMetadataCandidates([stale],[],[]);
    expect(result[0]).toBe(stale);
    expect(result[0].personalRating).toBe(9);
    expect(result[0].pendingProgressSync).toBe(true);
  });
  it('never archives any entry when all IDs have verified backups',()=>{
    const single=record('aaaaaaaaaaaaaaaaaaaaaaaa',true);
    expect(staleMetadataCandidates([single],[single.id],[])).toEqual([]);
    expect(staleMetadataCandidates([single],[],[single.id])).toEqual([]);
  });
});
