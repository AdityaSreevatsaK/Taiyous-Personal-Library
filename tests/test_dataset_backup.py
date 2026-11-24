"""Synthetic-only integrity and local restore-drill coverage. No HF credentials."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import types
import unittest
from unittest import mock
import zipfile
import sys

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "dataset_backup.py"
spec = importlib.util.spec_from_file_location("taiyou_dataset_backup", SCRIPT)
backup = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = backup
spec.loader.exec_module(backup)


class IndependentDatasetBackupTests(unittest.TestCase):
    def setUp(self):
        self.workspace = tempfile.TemporaryDirectory(prefix="taiyou-synthetic-recovery-")
        self.addCleanup(self.workspace.cleanup)
        self.base = Path(self.workspace.name)
        self.data = self.base / "export"
        (self.data / "data").mkdir(parents=True)
        (self.data / "data" / "library.json").write_text(
            json.dumps({"version": 1, "books": [{"id": "a" * 24}]}), encoding="utf-8")
        (self.data / "data" / "personal" / "progress").mkdir(parents=True)
        (self.data / "data" / "personal" / "progress" / (("a" * 24) + ".json")).write_text(
            '{"version":1,"progress":43}\n', encoding="utf-8")
        (self.data / "data" / "novels" / ("a" * 24)).mkdir(parents=True)
        (self.data / "data" / "novels" / ("a" * 24) / "source.epub").write_bytes(
            b"PK\x03\x04" + bytes(range(256)) * 1100)
        (self.data / ".gitattributes").write_text("*.epub filter=lfs\n", encoding="utf-8")
        self.archive = self.base / "immutable-backup.zip"

    def make(self):
        return backup.create(self.data, self.archive)

    def test_binary_manifest_hash_and_clean_restore(self):
        manifest, total = self.make()
        self.assertEqual(manifest["file_count"], 4)
        self.assertGreater(total, 200_000)
        self.assertEqual(manifest["source"]["mode"], "local-export")
        self.assertFalse(manifest["source"]["revision_verified"])
        verified, bytes_seen = backup.verify(self.archive)
        self.assertEqual((verified, bytes_seen), (manifest, total))
        destination = self.base / "restored"
        self.assertEqual(backup.restore_drill(self.archive, destination), (4, total))
        for entry in manifest["files"]:
            name = entry["path"]
            self.assertEqual(
                (self.data / name).read_bytes(), (destination / name).read_bytes())
        self.assertEqual(backup.restore_drill(self.archive), (4, total))

    def test_no_overwrite_and_no_archive_inside_input_or_repo(self):
        self.make()
        with self.assertRaises(backup.BackupError):
            self.make()
        with self.assertRaises(backup.BackupError):
            backup.create(self.data, self.data / "private.zip")
        with self.assertRaises(backup.BackupError):
            backup.create(self.data, backup.PROJECT_ROOT / "private-dataset.zip")

    def test_refuses_missing_or_corrupt_catalogue(self):
        (self.data / "data" / "library.json").unlink()
        with self.assertRaises(backup.BackupError):
            self.make()
        (self.data / "data" / "library.json").write_text('{"books":[]}', encoding="utf-8")
        with self.assertRaises(backup.BackupError):
            self.make()
        self.assertFalse(self.archive.exists())

    def test_refuses_symlink_export(self):
        link = self.data / "data" / "novels" / "link.epub"
        try:
            link.symlink_to(self.data / "data" / "library.json")
        except (OSError, NotImplementedError):
            self.skipTest("Symlinks unavailable on this operating system")
        with self.assertRaises(backup.BackupError):
            self.make()

    def test_rejects_tampered_epub_without_restoring(self):
        self.make()
        tampered = self.base / "tampered.zip"
        with zipfile.ZipFile(self.archive) as source, zipfile.ZipFile(tampered, "w") as target:
            for info in source.infolist():
                payload = source.read(info.filename)
                if info.filename.endswith("/source.epub"):
                    payload = payload[:-1] + bytes([payload[-1] ^ 1])
                target.writestr(info, payload)
        with self.assertRaises(backup.BackupError):
            backup.verify(tampered)
        dest = self.base / "must-not-be-created"
        with self.assertRaises(backup.BackupError):
            backup.restore_drill(tampered, dest)
        self.assertFalse(dest.exists())

    def test_refuses_zip_slip_and_unlisted_files(self):
        self.make()
        malicious = self.base / "malicious.zip"
        with zipfile.ZipFile(self.archive) as original, zipfile.ZipFile(malicious, "w") as out:
            for item in original.infolist():
                out.writestr(item, original.read(item.filename))
            out.writestr("payload/../../escape.json", b"bad")
        with self.assertRaises(backup.BackupError):
            backup.verify(malicious)
        self.assertFalse((self.base / "escape.json").exists())

    def test_refuses_duplicate_archived_paths(self):
        self.make()
        duplicate = self.base / "duplicate.zip"
        # Read source ZIP members before writing. Reusing a ZipInfo in a second
        # ZIP mutates its header_offset, corrupting the original fixture.
        with zipfile.ZipFile(self.archive) as original:
            members = [(item.filename, original.read(item.filename))
                       for item in original.infolist()]
        with zipfile.ZipFile(duplicate, "w") as out:
            for name, data in members:
                out.writestr(name, data)
            with self.assertWarns(UserWarning):
                out.writestr("manifest.json", dict(members)["manifest.json"])
        with self.assertRaises(backup.BackupError):
            backup.verify(duplicate)

    def test_pinned_inventory_must_match_every_file(self):
        all_files = {p.relative_to(self.data).as_posix()
                     for p in self.data.rglob("*") if p.is_file()}
        with self.assertRaises(backup.BackupError):
            backup.create(self.data, self.archive, expected=all_files - {".gitattributes"})
        with self.assertRaises(backup.BackupError):
            backup.create(self.data, self.archive, mode="hf-readonly", expected=all_files)
        self.assertFalse(self.archive.exists())

    def test_refuses_restore_into_existing_directory(self):
        self.make()
        prior = self.base / "prior"
        prior.mkdir()
        (prior / "untouched").write_text("retain", encoding="utf-8")
        with self.assertRaises(backup.BackupError):
            backup.restore_drill(self.archive, prior)
        self.assertEqual((prior / "untouched").read_text(), "retain")

    def test_never_accepts_noncanonical_paths(self):
        for path in ("../escape", "data/../escape", "/absolute", "c:\\secret", "data//x",
                     "data/./x", "data\\novels\\book", "", None):
            with self.subTest(path=path), self.assertRaises(backup.BackupError):
                backup.safe_path(path)


    def test_read_only_hf_capture_requires_token(self):
        with mock.patch.dict(os.environ, {"HF_READONLY_BACKUP_TOKEN": ""}):
            with self.assertRaises(backup.BackupError):
                backup.capture_hf("SyntheticOwner/test-dataset", self.archive)
        self.assertFalse(self.archive.exists())

    def test_read_only_hf_capture_pins_revision_and_complete_inventory(self):
        revision = "b" * 40
        repo = "SyntheticOwner/test-dataset"
        expected = {p.relative_to(self.data).as_posix()
                    for p in self.data.rglob("*") if p.is_file()}
        calls = []
        class FakeReadOnlyHfApi:
            def __init__(self, token):
                self.token = token

            def repo_info(self, *, repo_id, repo_type, token):
                calls.append(("info", repo_id, repo_type))
                self_token = self.token
                if self_token != token:
                    raise AssertionError("Token changed")
                return types.SimpleNamespace(private=True, sha=revision)

            def list_repo_files(self, *, repo_id, repo_type, revision, token):
                calls.append(("inventory", revision, repo_type))
                return sorted(expected)

        def fake_snapshot_download(*, repo_id, repo_type, revision, local_dir, token):
            calls.append(("download", revision, repo_type))
            for name in expected:
                dest = Path(local_dir) / name
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(self.data / name, dest)
            return local_dir

        provider = types.ModuleType("huggingface_hub")
        provider.HfApi = FakeReadOnlyHfApi
        provider.snapshot_download = fake_snapshot_download
        with mock.patch.dict(os.environ, {"HF_READONLY_BACKUP_TOKEN": "hf_synthetic_readonly"}):
            with mock.patch.dict(sys.modules, {"huggingface_hub": provider}):
                manifest, total = backup.capture_hf(repo, self.archive)
        self.assertEqual(manifest["source"]["mode"], "hf-readonly")
        self.assertTrue(manifest["source"]["revision_verified"])
        self.assertEqual(manifest["source"]["revision"], revision)
        self.assertEqual(manifest["source"]["repo_id"], repo)
        self.assertEqual(len(manifest["files"]), len(expected))
        self.assertGreater(total, 0)
        self.assertEqual(
            calls, [("info", repo, "dataset"), ("inventory", revision, "dataset"),
                    ("download", revision, "dataset")])
        self.assertEqual(backup.restore_drill(self.archive)[0], len(expected))

    def test_command_line_verify_and_temporary_restore(self):
        self.make()
        for command in ("verify", "restore-drill"):
            completed = subprocess.run(
                [sys.executable, str(SCRIPT), command, "--archive", str(self.archive)],
                capture_output=True, text=True, check=False)
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertIn("PASS", completed.stdout)

if __name__ == "__main__":
    unittest.main()
