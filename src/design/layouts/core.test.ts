
import {describe,expect,it} from 'vitest';
import {CONCEPTS,LAB_BOOKS,filterBooks} from './core';

describe('five distinct Taiyou layout concepts',()=>{
  it('defines five independent layouts with unique identifiers',()=>{
    expect(CONCEPTS).toHaveLength(5);
    expect(new Set(CONCEPTS.map(c=>c.id)).size).toBe(5);
    expect(CONCEPTS.map(c=>c.title)).toEqual([
      'Grand Library','Reading Desk','Bookshelf House',
      'Collection Atlas','Literary Journal'
    ]);
  });
  it('never imports actual novel library information into previews',()=>{
    expect(LAB_BOOKS).toHaveLength(8);
    expect(LAB_BOOKS.every(book=>book.author.includes('Fictional'))).toBe(true);
    expect(LAB_BOOKS.every(book=>/^[a-f0-9]{24}$/.test(book.id))).toBe(true);
  });
  it('keeps Trying out separate from in-progress and unread',()=>{
    expect(filterBooks(LAB_BOOKS,'reading')).toHaveLength(3);
    expect(filterBooks(LAB_BOOKS,'trying')).toHaveLength(2);
    expect(filterBooks(LAB_BOOKS,'unread')).toHaveLength(3);
    expect(filterBooks(LAB_BOOKS,'all')).toHaveLength(8);
  });
  it('supports case-insensitive searching by title and tag',()=>{
    expect(filterBooks(LAB_BOOKS,'all','immortal archivist')).toHaveLength(1);
    expect(filterBooks(LAB_BOOKS,'all','CULTIVATION')).toHaveLength(3);
    expect(filterBooks(LAB_BOOKS,'reading','CULTIVATION')).toHaveLength(2);
    expect(filterBooks(LAB_BOOKS,'trying','romance')).toHaveLength(0);
  });
});
