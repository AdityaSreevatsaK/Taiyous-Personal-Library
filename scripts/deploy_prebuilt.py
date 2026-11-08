"""Upload locally built Taiyou's Personal Library to the existing free HF Static Space.

Run from the project root after `npm run build`: py scripts/deploy_prebuilt.py
Requires `py -m pip install huggingface_hub` and the active deploy-only HF token.
No raw book archives, `.env` files, `node_modules`, or source code are uploaded.
"""
from pathlib import Path
from huggingface_hub import HfApi, CommitOperationAdd

SPACE = "AdityaSreevatsaK/Taiyous-Personal-Library"
ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
README = ROOT / "README.md"

if not (DIST / "index.html").is_file():
    raise SystemExit("Missing dist/index.html. Run npm run build first.")
if not README.is_file():
    raise SystemExit("Missing README.md.")

operations = [
    CommitOperationAdd(path_in_repo="README.md", path_or_fileobj=str(README)),
    *[
        CommitOperationAdd(path_in_repo="dist/" + p.relative_to(DIST).as_posix(), path_or_fileobj=str(p))
        for p in sorted(DIST.rglob("*")) if p.is_file()
    ],
]
result = HfApi().create_commit(
    repo_id=SPACE,
    repo_type="space",
    operations=operations,
    commit_message="Deploy prebuilt Taiyou's Personal Library v1.0.4",
)
print("Deployment commit:", result.commit_url)
