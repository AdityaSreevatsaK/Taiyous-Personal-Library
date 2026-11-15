import { describe, expect, it } from 'vitest';
import { virtualChapterWindow } from '../src/lib/chapter-virtual';
describe('large EPUB chapter picker virtual scrolling', () => {
  it('reaches the last chapter of a 507-chapter EPUB', () => {
    const last = virtualChapterWindow(507, 490);
    expect(last).toEqual({from:467,to:507});
  });
  it('handles huge chapter counts without rendering thousands of nodes', () => {
    const nearEnd=virtualChapterWindow(7212,7190);
    expect(nearEnd.to).toBe(7212);
    expect(nearEnd.to-nearEnd.from).toBeLessThanOrEqual(40);
    expect(virtualChapterWindow(2,0)).toEqual({from:0,to:2});
  });
});
