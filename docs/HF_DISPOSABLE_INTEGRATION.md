# Disposable private Hugging Face integration test

This is an opt-in release-gate workflow, not routine synthetic CI. It uses a dedicated HF token to create a uniquely named private disposable dataset and deletes only that dataset. Never use the production novel-storage token or point destructive tests at Taiyous-Novels.

## What the integrated acceptance proves

The PR #110 acceptance runs recorded in GitHub Actions validated:
- Creation and privacy of a disposable HF dataset.
- Read/migration of existing-format version-1 progress, review and collection records.
- Immutable revision / parent-commit protection against stale writes.
- The shipping Cloudflare Pages Functions running locally over HTTPS.
- Two distinct encrypted Secure HttpOnly browser sessions.
- Offline edit and reconnect, competing updates, conflict approval and recovery from the second browser.
- Cleanup of the uniquely named disposable dataset.

Evidence: [real HF integration run](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/44921602074) and [two-browser acceptance run](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/44924684751).

## Important limitation

The two-browser acceptance did not exercise Hugging Face's interactive consent/authorisation redirect or PKCE token-exchange flow. It provisioned two isolated authenticated sessions and tested the protected Pages Functions and HF data path. Do not describe this as full interactive OAuth sign-in E2E coverage.

## Running safely

Inspect .github/workflows/verify-hf-disposable.yml, scripts/hf_disposable_integration.py, scripts/isolated_hf_pages.mjs and scripts/isolated_two_browser_acceptance.mjs before running. Use only HF_DISPOSABLE_TEST_TOKEN with permission to create/delete new private test datasets. The workflow should record a blocked/not-run result if the dedicated secret is missing; inspect the actual job steps, not only the overall conclusion.

For local use, install huggingface_hub in an isolated Python environment and provide the token via an environment variable or secret manager. Do not paste credentials into chat, commit them, print them, or include them in artefacts. The helper's cleanup must only target the uniquely created disposable dataset.

Never point this workflow at the production dataset. Never weaken owner validation, Secure cookie handling, TLS verification, path validation or revision checks to make the test pass.

See docs/ISOLATED_TWO_BROWSER_ACCEPTANCE.md for test architecture and limitations, docs/ISSUE_34_REVISION_SAFE_SYNC.md for the delivered change, and docs/TESTING_RELEASE_RUNBOOK.md for release gates.
