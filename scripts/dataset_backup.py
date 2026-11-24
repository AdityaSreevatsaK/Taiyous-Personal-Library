#!/usr/bin/env python3
"""Private Novel Library dataset backup and LOCAL-only restore drill.

This utility never calls Hugging Face write/delete endpoints. The optional
capture-hf action reads a private dataset at a single immutable revision.
Archive creation, verification and restoration use the Python standard library.

Private backups MUST be saved outside the repository and encrypted at rest.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import sys
import tempfile
import zipfile

FORMAT = "taiyou-private-dataset-backup-v1"
MANIFEST = "manifest.json"
PREFIX = "payload/"
CHUNK = 1024 * 1024
MAX_FILES = 100_000
MAX_TOTAL_BYTES = 2 * 1024**4
PROJECT_ROOT = Path(__file__).resolve().parent.parent
EXPECTED_CATALOGUE = "data/library.json"
REVISION_RE = re.compile(r"^[a-f0-9]{40}$")
REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
HASH_RE = re.compile(r"^[a-f0-9]{64}$")


class BackupError(Exception):
    """A fail-closed backup or verification failure."""


def safe_path(name: str) -> str:
    if not isinstance(name, str) or not name or "\\" in name or "\x00" in name:
        raise BackupError("Invalid backup path")
    p = PurePosixPath(name)
    if p.is_absolute() or any(part in ("", ".", "..") for part in name.split("/")):
        raise BackupError("Unsafe backup path")
    if p.as_posix() != name or name.startswith("/") or ":" in name.split("/")[0]:
        raise BackupError("Non-canonical backup path")
    return name


def outside_project(path: Path) -> Path:
    resolved = path.resolve()
    if resolved == PROJECT_ROOT or PROJECT_ROOT in resolved.parents:
        raise BackupError("Private backups and restored data must remain outside the source repository")
    return resolved


def source_files(source: Path, expected: set[str] | None = None) -> list[tuple[str, Path]]:
    if not source.is_dir() or source.is_symlink():
        raise BackupError("Backup source must be an ordinary directory")
    records = []
    for p in source.rglob("*"):
        rel = p.relative_to(source).as_posix()
        if rel == ".cache/huggingface" or rel.startswith(".cache/huggingface/"):
            if expected is None:
                raise BackupError("Local export contains Hugging Face cache metadata; remove it first")
            continue
        safe_path(rel)
        if p.is_symlink() or not (p.is_dir() or p.is_file()):
            raise BackupError("Refusing symbolic links or special files in backup source")
        if p.is_file():
            if not stat.S_ISREG(p.stat(follow_symlinks=False).st_mode):
                raise BackupError("Source must contain regular files only")
            records.append((rel, p))
            if len(records) > MAX_FILES:
                raise BackupError("Too many files for a safe backup")
    records.sort(key=lambda item: item[0])
    names = {name for name, _ in records}
    if len(names) != len(records) or len({x.casefold() for x in names}) != len(names):
        raise BackupError("Duplicate or case-colliding paths")
    if EXPECTED_CATALOGUE not in names:
        raise BackupError("Missing library catalogue; stop and diagnose before making a recovery backup")
    if expected is not None and names != expected:
        raise BackupError("Pinned Hugging Face snapshot is incomplete or contains unexpected files")
    try:
        with (source / EXPECTED_CATALOGUE).open("r", encoding="utf-8") as handle:
            catalog = json.load(handle)
        if catalog.get("version") != 1 or not isinstance(catalog.get("books"), list):
            raise ValueError("Unsupported or missing catalogue fields")
    except (ValueError, OSError, AttributeError) as exc:
        raise BackupError("Catalogue is not a valid version-1 library index") from exc
    return records


def stream_digest(handle) -> tuple[int, str]:
    hasher = hashlib.sha256()
    size = 0
    while True:
        chunk = handle.read(CHUNK)
        if not chunk:
            break
        size += len(chunk)
        if size > MAX_TOTAL_BYTES:
            raise BackupError("Unexpectedly large backup entry")
        hasher.update(chunk)
    return size, hasher.hexdigest()


def verify(archive: Path) -> tuple[dict, int]:
    if not archive.is_file() or archive.is_symlink():
        raise BackupError("Archive missing or not a regular file")
    try:
        with zipfile.ZipFile(archive, "r") as bundle:
            infos = bundle.infolist()
            if not infos or len(infos) > MAX_FILES + 1:
                raise BackupError("Invalid archive entry count")
            names = [info.filename for info in infos]
            if len(names) != len(set(names)) or len(names) != len(set(n.casefold() for n in names)):
                raise BackupError("Duplicate or case-colliding archive entry")
            if names.count(MANIFEST) != 1:
                raise BackupError("Exactly one manifest is required")
            for info in infos:
                if info.is_dir() or info.flag_bits & 1:
                    raise BackupError("Directory/encrypted ZIP entries are not supported")
                if info.filename != MANIFEST:
                    if not info.filename.startswith(PREFIX):
                        raise BackupError("Unknown ZIP member outside payload")
                    safe_path(info.filename[len(PREFIX):])
                mode = (info.external_attr >> 16) & 0o170000
                if mode not in (0, stat.S_IFREG):
                    raise BackupError("ZIP contains a symbolic link or other special member")
            info = bundle.getinfo(MANIFEST)
            if info.file_size > 32 * 1024 * 1024:
                raise BackupError("Manifest is unreasonably large")
            manifest = json.loads(bundle.read(MANIFEST))
            if not isinstance(manifest, dict) or manifest.get("format") != FORMAT:
                raise BackupError("Unrecognised backup manifest format")
            entries = manifest.get("files")
            if not isinstance(entries, list) or not entries or len(entries) > MAX_FILES:
                raise BackupError("Malformed backup file list")
            recorded = set()
            total = 0
            for entry in entries:
                if not isinstance(entry, dict):
                    raise BackupError("Malformed manifest entry")
                name = safe_path(entry.get("path"))
                length, digest = entry.get("bytes"), entry.get("sha256")
                if (name in recorded or not isinstance(length, int) or isinstance(length, bool) or
                        length < 0 or not isinstance(digest, str) or not HASH_RE.fullmatch(digest)):
                    raise BackupError("Invalid manifest path, size or digest")
                recorded.add(name)
                member = PREFIX + name
                if member not in names or bundle.getinfo(member).file_size != length:
                    raise BackupError("Missing or incorrectly sized backup entry")
                with bundle.open(member, "r") as handle:
                    actual_size, actual_hash = stream_digest(handle)
                if (actual_size, actual_hash) != (length, digest):
                    raise BackupError("Backup entry failed SHA-256 integrity verification")
                total += actual_size
                if total > MAX_TOTAL_BYTES:
                    raise BackupError("Archive exceeds safe size bound")
            if set(names) != {MANIFEST} | {PREFIX + n for n in recorded}:
                raise BackupError("Archive contains unlisted payload files")
            if EXPECTED_CATALOGUE not in recorded:
                raise BackupError("Archive lacks the required catalogue")
            if manifest.get("file_count") != len(entries) or manifest.get("total_bytes") != total:
                raise BackupError("Manifest total does not match verified files")
            return manifest, total
    except (zipfile.BadZipFile, json.JSONDecodeError, EOFError, UnicodeDecodeError) as exc:
        raise BackupError("Corrupt ZIP archive or manifest") from exc


def create(source: Path, output: Path, *, mode: str = "local-export",
           repo: str | None = None, revision: str | None = None,
           expected: set[str] | None = None) -> tuple[dict, int]:
    source = outside_project(source)
    output = outside_project(output)
    if not output.parent.is_dir() or output.exists() or output.is_symlink():
        raise BackupError("Output must not exist and its parent directory must exist")
    if output == source or source in output.parents or output in source.parents:
        raise BackupError("Archive cannot be nested within its input dataset")
    records = source_files(source, expected)
    if repo is not None and not REPO_RE.fullmatch(repo):
        raise BackupError("Invalid dataset repository identifier")
    if revision is not None and not REVISION_RE.fullmatch(revision):
        raise BackupError("Only immutable 40-character dataset revisions are accepted")
    if mode == "hf-readonly" and (repo is None or revision is None or expected is None):
        raise BackupError("Read-only HF capture requires a pinned revision and complete file list")
    total, entries = 0, []
    fd, temporary = tempfile.mkstemp(prefix=".taiyou-backup-", suffix=".part", dir=output.parent)
    try:
        # Windows lacks os.fchmod on some Python builds. mkstemp creates a
        # private file; keep the POSIX permission hardening when available.
        if hasattr(os, "fchmod"):
            os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as output_handle:
            with zipfile.ZipFile(output_handle, "w", allowZip64=True) as bundle:
                for name, p in records:
                    initial = p.stat(follow_symlinks=False)
                    if not stat.S_ISREG(initial.st_mode):
                        raise BackupError("Source file changed to special file during capture")
                    hasher, length = hashlib.sha256(), 0
                    info = zipfile.ZipInfo(PREFIX + name, date_time=(1980, 1, 1, 0, 0, 0))
                    info.external_attr = (stat.S_IFREG | 0o600) << 16
                    info.compress_type = zipfile.ZIP_STORED
                    with p.open("rb") as reader, bundle.open(info, "w", force_zip64=True) as writer:
                        while chunk := reader.read(CHUNK):
                            length += len(chunk)
                            total += len(chunk)
                            if total > MAX_TOTAL_BYTES:
                                raise BackupError("Backup exceeds safe size limit")
                            hasher.update(chunk)
                            writer.write(chunk)
                    latest = p.stat(follow_symlinks=False)
                    if (initial.st_size != length or latest.st_size != initial.st_size or
                            latest.st_mtime_ns != initial.st_mtime_ns or
                            latest.st_ino != initial.st_ino):
                        raise BackupError("Dataset changed during capture; retry on a pinned snapshot")
                    entries.append({"path": name, "bytes": length, "sha256": hasher.hexdigest()})
                manifest = {
                    "format": FORMAT, "created_utc": datetime.now(timezone.utc).isoformat(),
                    "source": {"mode": mode, "repo_id": repo, "revision": revision,
                               "revision_verified": mode == "hf-readonly"},
                    "file_count": len(entries), "total_bytes": total, "files": entries,
                }
                metadata = zipfile.ZipInfo(MANIFEST, date_time=(1980, 1, 1, 0, 0, 0))
                metadata.external_attr = (stat.S_IFREG | 0o600) << 16
                metadata.compress_type = zipfile.ZIP_STORED
                bundle.writestr(metadata, json.dumps(manifest, sort_keys=True, separators=(",", ":")))
            output_handle.flush()
            os.fsync(output_handle.fileno())
        verified, verified_total = verify(Path(temporary))
        if verified_total != total or verified != manifest:
            raise BackupError("New archive did not pass independent verification")
        try:
            os.link(temporary, output)  # Atomic no-overwrite finalisation.
        except FileExistsError as exc:
            raise BackupError("Refusing to overwrite an existing backup") from exc
        return verified, total
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def restore_drill(archive: Path, destination: Path | None = None) -> tuple[int, int]:
    manifest, total = verify(archive)
    ephemeral = None
    if destination is None:
        ephemeral = tempfile.TemporaryDirectory(prefix="taiyou-restore-drill-")
        root = Path(ephemeral.name)
    else:
        root = outside_project(destination)
        if root.exists() or root.is_symlink() or not root.parent.is_dir():
            raise BackupError("Restore-drill destination must not exist and must be outside source")
        root.mkdir(mode=0o700)
    try:
        with zipfile.ZipFile(archive) as bundle:
            for entry in manifest["files"]:
                file = root.joinpath(*entry["path"].split("/"))
                file.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                fd = os.open(file, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
                with os.fdopen(fd, "wb") as target, bundle.open(PREFIX + entry["path"]) as src:
                    shutil.copyfileobj(src, target, CHUNK)
                with file.open("rb") as stream:
                    size, digest = stream_digest(stream)
                if (size, digest) != (entry["bytes"], entry["sha256"]):
                    raise BackupError("Restored local file does not match backup SHA-256")
        if len([p for p in root.rglob("*") if p.is_file()]) != manifest["file_count"]:
            raise BackupError("Restored file count mismatch")
        return manifest["file_count"], total
    except Exception:
        if destination is not None:
            shutil.rmtree(root)  # Only a freshly created destination owned by this drill.
        raise
    finally:
        if ephemeral is not None:
            ephemeral.cleanup()


def capture_hf(repo: str, output: Path):
    """Read-only download at an immutable revision; never uploads or deletes."""
    if not REPO_RE.fullmatch(repo):
        raise BackupError("Invalid Hugging Face dataset identifier")
    token = os.environ.get("HF_READONLY_BACKUP_TOKEN", "").strip()
    if not token.startswith("hf_"):
        raise BackupError("HF_READONLY_BACKUP_TOKEN must be configured privately")
    try:
        from huggingface_hub import HfApi, snapshot_download
    except ImportError as exc:
        raise BackupError("Install huggingface_hub in a private Python environment") from exc
    api = HfApi(token=token)
    info = api.repo_info(repo_id=repo, repo_type="dataset", token=token)
    if getattr(info, "private", None) is not True or not REVISION_RE.fullmatch(info.sha or ""):
        raise BackupError("Refusing an unverified/private dataset or mutable revision")
    pinned = info.sha
    paths = set(api.list_repo_files(repo_id=repo, repo_type="dataset",
                                    revision=pinned, token=token))
    if not paths or any(safe_path(x) != x for x in paths):
        raise BackupError("Cannot establish complete pinned dataset inventory")
    with tempfile.TemporaryDirectory(prefix="taiyou-hf-readonly-") as temp:
        snapshot_download(repo_id=repo, repo_type="dataset", revision=pinned,
                          local_dir=temp, token=token)
        return create(Path(temp), output, mode="hf-readonly",
                      repo=repo, revision=pinned, expected=paths)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    local = commands.add_parser("create-local", help="Backup a local exported dataset (revision not authenticated)")
    local.add_argument("--source", type=Path, required=True)
    local.add_argument("--output", type=Path, required=True)
    hf = commands.add_parser("capture-hf", help="Read-only pinned private-HF download and archive")
    hf.add_argument("--repo", default="AdityaSreevatsaK/Taiyous-Novels")
    hf.add_argument("--output", type=Path, required=True)
    check = commands.add_parser("verify", help="Verify every archived byte against SHA-256")
    check.add_argument("--archive", type=Path, required=True)
    drill = commands.add_parser("restore-drill", help="Restore LOCALLY only; never to HF")
    drill.add_argument("--archive", type=Path, required=True)
    drill.add_argument("--destination", type=Path, help="Nonexistent external path; omit for auto-cleaned temporary drill")
    args = parser.parse_args(argv)
    try:
        if args.command == "create-local":
            manifest, total = create(args.source, args.output)
        elif args.command == "capture-hf":
            manifest, total = capture_hf(args.repo, args.output)
        elif args.command == "verify":
            manifest, total = verify(args.archive)
        else:
            count, total = restore_drill(args.archive, args.destination)
            print(f"PASS: local-only restore drill, {count} intact files, {total} bytes")
            return 0
        with args.output.open("rb") if hasattr(args, "output") else args.archive.open("rb") as f:
            _, sha = stream_digest(f)
        print(f"PASS: {args.command}: {manifest['file_count']} verified files, "
              f"{total} bytes, archive SHA-256 {sha}")
        if args.command == "create-local":
            print("NOTE: This local export does not prove an authenticated HF revision.")
        if args.command == "capture-hf":
            print(f"PASS: private HF dataset pinned to {manifest['source']['revision']} (read-only).")
        return 0
    except (BackupError, OSError, ValueError, zipfile.LargeZipFile) as exc:
        print(f"BLOCKED: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
