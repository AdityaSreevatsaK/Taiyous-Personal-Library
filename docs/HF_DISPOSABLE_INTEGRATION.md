# Disposable private Hugging Face integration test

This is a **release-gate helper**, not an ordinary CI smoke test.

Run `scripts/hf_disposable_integration.py` only with a private Hugging Face token permitted to create and delete **new private test datasets**. It never opens, edits or deletes `Taiyous-Novels`. For safety, the helper creates a unique `taiyou-disposable-sync-*` dataset in the authenticated user's namespace, verifies it is private, simulates two competing updates for each existing version-1 personal document, checks the stale parent's write is rejected, and removes **only that newly created test dataset** in a `finally` block.

## Local usage

Install `huggingface_hub` in an isolated Python environment:

```powershell
python -m pip install huggingface_hub
$env:HF_DISPOSABLE_TEST_TOKEN = Read-Host 'Enter disposable-test HF token'
python scripts/hf_disposable_integration.py
Remove-Item Env:HF_DISPOSABLE_TEST_TOKEN
```

**Never add credentials to the repository or workflow logs.** The test token needs permissions to create/delete disposable datasets. If your existing fine-grained token is scoped to the production dataset, do **not** broaden or reuse that token for this test.

### What this proves

- A newly created dataset is private.
- Existing version-1 progress, review and collection JSON remains readable.
- `parent_commit` guards reject an update based on a stale revision.
- The winning document remains unchanged after the rejected stale update.
- No real novel data is used.

### What this does not prove

It **does not** complete the separate browser OAuth/Cloudflare gateway acceptance gate. The server currently targets `AdityaSreevatsaK/Taiyous-Novels`; do not point an authenticated test at that production dataset to force a green result. Before releasing the sync changes, use an isolated Cloudflare preview configured for the disposable dataset, with authorised OAuth, and test two browser sessions (including offline edits, conflict comparison, retries, note/shelf preservation). Do not deploy the PR to production until this is accepted.

The script is opt-in and must be **run and reviewed**, not merely committed, before treating its real-HF part as passed.
