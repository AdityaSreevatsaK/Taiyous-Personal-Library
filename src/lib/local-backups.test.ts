import { describe, expect, it } from 'vitest';
import { partitionLocalBackups } from './local-backups';
import type { LibraryBook } from '../types';
function make(id: string, title: string, author: string, cloud: boolean): LibraryBook {
  return { id, title, author, cloud, originalFileName:'original.epub',
    importedAt:1, progress:17, size:2048, personalReview:'Do not lose this note' };
}
describe('non-destructive local/hosted novel display de-duplication', () => {
  const hosted = make('aaaaaaaaaaaaaaaaaaaaaaaa','Abe the Wizard','The Mass of Eating Melon Seeds',true);
  const backup = make('bbbbbbbbbbbbbbbbbbbbbbbb',' Abe the   Wizard ','the mass of eating melon seeds',false);
  it('shows one canonical novel and separately retains the genuine local backup record', () => {
    const result=partitionLocalBackups([backup,hosted]);
    expect(result.library).toEqual([hosted]);
    expect(result.localBackups).toEqual([backup]);
    expect(backup.personalReview).toBe('Do not lose this note');
    expect(backup.progress).toBe(17);
  });
  it('does not conflate two different authors or genuinely distinct works', () => {
    const different = make('cccccccccccccccccccccccc','Abe the Wizard','Different Author',false);
    const result=partitionLocalBackups([hosted,different]);
    expect(result.library).toHaveLength(2);
    expect(result.localBackups).toEqual([]);
  });
  it('does not hide a local copy if matching multiple different hosted IDs', () => {
    const other = { ...hosted, id:'dddddddddddddddddddddddd' };
    const result=partitionLocalBackups([hosted,other,backup]);
    expect(result.library).toHaveLength(3);
    expect(result.localBackups).toEqual([]);
  });
  it('does not hide locally saved books without any confirmed hosted counterpart', () => {
    expect(partitionLocalBackups([backup])).toEqual({library:[backup],localBackups:[]});
  });
  it('normalises Unicode and whitespace but avoids matching unknown authors', () => {
    const a=make('eeeeeeeeeeeeeeeeeeeeeeee','ＦＡＮＴＡＳＹ','Author',true);
    const b=make('ffffffffffffffffffffffff','Fantasy',' Author ',false);
    const unknown=make('111111111111111111111111','Fantasy','Unknown',false);
    const result=partitionLocalBackups([a,b,unknown]);
    expect(result.localBackups).toEqual([b]);
    expect(result.library).toEqual([a,unknown]);
  });
});
