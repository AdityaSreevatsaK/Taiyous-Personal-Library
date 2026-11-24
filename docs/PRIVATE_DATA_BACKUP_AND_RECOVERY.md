# Private Novel Dataset: Independent Backup and Recovery

This is a **manual, read-only backup workflow**, not a background service, dataset migration or permission to restore/overwrite production. The canonical private HF dataset is `AdityaSreevatsaK/Taiyous-Novels`. Back up the catalogue, EPUB/ZIP/cover originals and all personal-state files together. Git history and cached offline EPUBs are **not independent backups**.

## Safety properties

- `scripts/dataset_backup.py capture-hf` reads the private HF dataset at a **pinned immutable revision**, downloads its complete file inventory and creates a portable ZIP. It **never invokes HF write/delete APIs**.
- Every archived file has a SHA-256 digest and exact byte size. Manifest totals, catalogue schema, completeness, unsupported path entries, symlinks, duplicates and changes during capture are checked fail-closed.
- `verify` streams and hashes every archived file. `restore-drill` verifies the ZIP *before extraction*, restores only to a freshly created local directory and re-hashes the restored files. It does not connect to HF.
- Archive creation has a restrictive temporary file and an atomic no-overwrite finalisation. **ZIP itself is not encrypted.** Store your copy in encrypted private storage, separate from the HF account and source code.
- CI uses synthetic metadata, EPUB bytes and personal progress only. It never downloads production novels or puts their names, private data or tokens in job logs.
- `create-local` archives an existing complete local export, but labels its revision **unverified**. Do not confuse it with authenticated pinned HF capture.

## Manual production capture

Use a trusted machine with sufficient space for the dataset, temporary snapshot and uncompressed ZIP. Install `huggingface_hub>=0.28,<2` in a private Python environment. Supply `HF_READONLY_BACKUP_TOKEN` securely from a password manager: a **read-only, dataset-scoped fine-grained HF token**, not the disposable CI create/delete token. Never post or commit the token.

Choose a destination directory that already exists **outside the source repository** and is not publicly synchronised. On Windows PowerShell:

```powershell
python -m pip install 'huggingface_hub>=0.28,<2'
python scripts/dataset_backup.py capture-hf --repo AdityaSreevatsaK/Taiyous-Novels --output 'D:\PrivateEncryptedBackups\Taiyou\snapshot-2026-11-24.zip'
python scripts/dataset_backup.py verify --archive 'D:\PrivateEncryptedBackups\Taiyou\snapshot-2026-11-24.zip'
python scripts/dataset_backup.py restore-drill --archive 'D:\PrivateEncryptedBackups\Taiyou\snapshot-2026-11-24.zip'
```

The tool refuses to overwrite an existing archive. Select a unique filename each time. **Record the printed archive SHA-256 in a separate trusted location**, so a compromised archive cannot simply substitute its own manifest and claim authenticity. Retain at least one independently encrypted, offline/offsite copy. The capture pins HF reads to one dataset SHA and requires that the downloaded file set exactly matches the provider's pinned file inventory. A missing or malformed `data/library.json` is a recovery incident, **not** permission to create an empty catalogue.

For a complete directory export already held privately, you can instead run `python scripts/dataset_backup.py create-local --source PATH --output ARCHIVE`. Local exports have no authenticated remote revision proof.

## Local recovery drill (never a production HF restore)

To inspect a new local directory instead of using an automatically removed temporary drill:

```powershell
python scripts/dataset_backup.py restore-drill --archive 'D:\PrivateEncryptedBackups\Taiyou\snapshot-2026-11-24.zip' --destination 'D:\PrivateEncryptedBackups\Taiyou\drill-2026-11-24'
```

Only a newly created destination is written. Any existing path is refused. Treat extracted files as sensitive and securely remove them after inspection. The utility deliberately has **no remote restoration option**.

Before any live dataset migration, deletion or restoration: independently verify the private repo identity, exact SHA, full archive, separate encrypted copy, and a tested rollback procedure. Explicit owner approval is required for the specific operation. Practise remote recovery on synthetic records in a new disposable dataset before touching production.

## Evidence and failure handling

`.github/workflows/verify.yml` runs `python3 -m unittest discover -s tests -p 'test_dataset_backup.py' -v`. The synthetic tests cover binary integrity, restore fidelity, manifest tampering, ZIP traversal, duplicate members, symlinks, missing catalogue, inventory mismatch and refusing overwrite. **This does not prove a real production archive exists.**

If the catalogue is missing or backup verification fails, stop all writes, retain the original evidence and examine immutable HF revisions. Do not recreate or delete the production dataset. See [Operations and Recovery](OPERATIONS_DECISIONS_AND_BACKLOG.md) and the [Release Runbook](TESTING_RELEASE_RUNBOOK.md).
