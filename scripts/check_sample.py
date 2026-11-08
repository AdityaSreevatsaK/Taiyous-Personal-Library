#!/usr/bin/env python3
"""Inspect a user-owned Novel Library ZIP without copying or printing its text.

Usage: python scripts/check_sample.py path/to/novel-42368620891.zip
"""
import hashlib
import io
import json
import sys
import zipfile
from pathlib import Path


def verify(path: Path) -> int:
    if not path.is_file():
        print(f"File not found: {path}")
        return 2
    errors = []
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        base = next((name[:-len('metadata.json')] for name in names if name.endswith('metadata.json')), None)
        if base is None:
            print('No metadata.json found in the supplied archive')
            return 1
        meta = json.loads(archive.read(base + 'metadata.json'))
        chapters = json.loads(archive.read(base + 'chapters.json'))
        if meta.get('chapter_count') != len(chapters):
            errors.append('Metadata count does not match chapters.json')
        for expected, chapter in enumerate(chapters, start=1):
            if chapter.get('chapter_number') != expected:
                errors.append(f'Unexpected chapter numbering at index {expected}')
            chapter_path = base + chapter['file']
            if chapter_path not in names:
                errors.append(f'Missing {chapter_path}')
                continue
            contents = archive.read(chapter_path)
            if hashlib.sha256(contents).hexdigest() != chapter.get('sha256'):
                errors.append(f'SHA-256 mismatch: {chapter_path}')
            try:
                contents.decode('utf-8')
            except UnicodeDecodeError:
                errors.append(f'Invalid UTF-8: {chapter_path}')
        epub_filename = base + 'source.epub'
        if epub_filename not in names:
            errors.append('Missing source.epub')
            epub_size = 0
        else:
            epub_bytes = archive.read(epub_filename)
            epub_size = len(epub_bytes)
            try:
                with zipfile.ZipFile(io.BytesIO(epub_bytes)) as epub:
                    if 'META-INF/container.xml' not in epub.namelist():
                        errors.append('EPUB missing META-INF/container.xml')
            except zipfile.BadZipFile:
                errors.append('source.epub is not a ZIP/EPUB')
        print(f"Title: {meta.get('title', 'Unknown')}")
        print(f"Author: {meta.get('author', 'Unknown')}")
        print(f"Chapters: {len(chapters)}")
        print(f"EPUB size: {epub_size:,} bytes")
    print(f"Result: {'PASS' if not errors else 'FAIL'} ({len(errors)} errors)")
    for error in errors[:20]:
        print(f'  - {error}')
    if len(errors) > 20:
        print(f'  ...and {len(errors) - 20} more')
    return 0 if not errors else 1


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print('Usage: python scripts/check_sample.py <novel.zip>')
        sys.exit(2)
    sys.exit(verify(Path(sys.argv[1])))
