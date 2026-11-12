#!/usr/bin/env python3
"""Opt-in HF Hub CAS probe. Creates and deletes ONLY a newly created private dataset.

Requires HF_DISPOSABLE_TEST_TOKEN, never touches Taiyous-Novels. No credentials
are committed or printed. This tests Hugging Face's real commit preconditions,
not the separate OAuth browser/session gateway.
"""
from __future__ import annotations

import json
import os
import secrets
import sys
from typing import Any

from huggingface_hub import HfApi, hf_hub_download


BOOK_ID = "a" * 24
PATHS = {
    "progress": f"data/personal/progress/{BOOK_ID}.json",
    "review": f"data/personal/reviews/{BOOK_ID}.json",
    "collections": "data/personal/collections.json",
}


def sample_document(kind: str, change: int) -> dict[str, Any]:
    if kind == "progress":
        return {
            "version": 1, "bookId": BOOK_ID, "progress": 25 + change,
            "currentChapter": f"Chapter {25 + change}",
            "currentChapterIndex": 24 + change,
            "currentChapterNumber": 25 + change, "lastCfi": None,
            "lastOpenedAt": 1000 + change, "updatedAt": 1000 + change,
        }
    if kind == "review":
        return {
            "version": 1, "bookId": BOOK_ID, "rating": 6 + change,
            "comments": f"Disposable sample note {change}",
            "shelfStatus": "trying", "updatedAt": 1000 + change,
        }
    return {
        "version": 1,
        "collections": [{
            "id": "disposable_series_001", "name": f"Test Series {change}",
            "bookIds": [BOOK_ID], "updatedAt": 1000 + change,
        }],
    }


def encoded(value: dict[str, Any]) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def main() -> int:
    token = os.environ.get("HF_DISPOSABLE_TEST_TOKEN", "").strip()
    if not token.startswith("hf_"):
        print("BLOCKED: set HF_DISPOSABLE_TEST_TOKEN via a private environment, never in source.")
        return 2

    api = HfApi(token=token)
    user_info = api.whoami()
    name = user_info["name"]
    dataset_name = f"taiyou-disposable-sync-{secrets.token_hex(5)}"
    repo_id = f"{name}/{dataset_name}"
    created = False
    try:
        api.create_repo(repo_id=repo_id, repo_type="dataset", private=True, exist_ok=False)
        created = True
        info = api.repo_info(repo_id=repo_id, repo_type="dataset")
        if info.private is not True:
            raise RuntimeError("Created dataset privacy could not be verified: refuse all writes.")

        for kind, path in PATHS.items():
            initial = sample_document(kind, 0)
            first_parent = api.repo_info(repo_id=repo_id, repo_type="dataset").sha
            if not first_parent:
                raise RuntimeError("Cannot obtain dataset revision before write.")

            api.upload_file(
                repo_id=repo_id, repo_type="dataset", path_in_repo=path,
                path_or_fileobj=encoded(initial),
                parent_commit=first_parent, commit_message=f"Seed disposable {kind}",
            )
            old_parent = api.repo_info(repo_id=repo_id, repo_type="dataset").sha
            if not old_parent:
                raise RuntimeError("Cannot obtain current revision.")

            newer = sample_document(kind, 1)
            stale = sample_document(kind, 2)
            api.upload_file(
                repo_id=repo_id, repo_type="dataset", path_in_repo=path,
                path_or_fileobj=encoded(newer),
                parent_commit=old_parent, commit_message=f"Simulate device A {kind}",
            )

            rejected = False
            try:
                api.upload_file(
                    repo_id=repo_id, repo_type="dataset", path_in_repo=path,
                    path_or_fileobj=encoded(stale), parent_commit=old_parent,
                    commit_message=f"Simulate stale device B {kind}",
                )
            except Exception:
                rejected = True
            if not rejected:
                raise AssertionError(f"Stale {kind} write unexpectedly succeeded.")

            latest = api.repo_info(repo_id=repo_id, repo_type="dataset").sha
            resolved_path = hf_hub_download(
                repo_id=repo_id, repo_type="dataset", filename=path,
                revision=latest, token=token,
            )
            with open(resolved_path, "r", encoding="utf-8") as handle:
                result = json.load(handle)
            if result != newer:
                raise AssertionError(f"Stale {kind} write modified the remote record.")

            print(f"PASS {kind}: private, version-1 compatible and stale write rejected")

        print("PASS all disposable HF parent-commit and privacy checks.")
        print("NOTE: Browser OAuth/Cloudflare gateway integration is a separate release gate.")
        return 0
    finally:
        if created:
            # Guard against ever deleting a pre-existing or real novel dataset.
            if (repo_id.startswith(name + "/taiyou-disposable-sync-") and
                    repo_id.endswith(dataset_name) and
                    repo_id != "AdityaSreevatsaK/Taiyous-Novels"):
                api.delete_repo(repo_id=repo_id, repo_type="dataset")
                print("Disposable test dataset removed.")
            else:
                raise RuntimeError("Refused to delete dataset with an unsafe identifier.")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"Disposable HF integration FAILED: {type(exc).__name__}: {exc}")
        sys.exit(1)
