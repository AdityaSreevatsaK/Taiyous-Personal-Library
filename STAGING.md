# Staging only (`dev`)

This branch is based on the restored production v1.0.4 source and intentionally contains **no unverified v1.2.x changes**. The deployment script targets only `AdityaSreevatsaK/Taiyous-Personal-Library-Staging` and verifies the Space is Private.

Next steps: introduce UI enhancements and security improvements incrementally, with real browser tests before any promotion to `master`. Staging should initially use its own browser state and a **read-only** token for the private dataset, so it cannot modify novel data during tests.
