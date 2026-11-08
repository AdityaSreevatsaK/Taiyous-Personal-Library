# Private source control for Taiyou’s Personal Library

- **master**: frozen restored v1.0.4 production baseline. Production deployment is manual and must use verified contents from master only.
- **dev**: staging and new work. Pull requests should merge dev into master only after browser verification.
- No novel files, local database files, saved notes, credentials or Hugging Face tokens belong in GitHub.
- The original novel ZIPs and EPUBs remain in the separate private Hugging Face dataset.
- CI performs npm tests, TypeScript/Vite production build, and production dependency audit. Never add HF tokens to CI before a separate security review.
- The repository must remain **Private**, as must both Hugging Face Spaces and the novel dataset.

## Releasing

1. Commit feature changes on `dev`.
2. Run GitHub CI and verify app in the *private staging Space* using a dataset read-only token.
3. Test chapter navigation, cloud catalogue, notes/progress, mobile and private access.
4. Create a reviewed pull request `dev → master`.
5. Deploy the exact approved master commit to production via the established authenticated deployment procedure.
6. Keep the last working production commit as a rollback point.
