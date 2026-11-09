"""Fail closed if a prebuilt Hugging Face Static Space package looks unsafe."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
README = ROOT / "README.md"
SAFE_SUFFIXES = {".html", ".js", ".css", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".otf", ".map", ".json", ".webmanifest", ".txt"}
BLOCKED_SUFFIXES = {".epub", ".zip", ".env", ".pem", ".key", ".p12", ".pfx", ".db", ".sqlite"}
SECRETS = [
    re.compile(rb"hf_[A-Za-z0-9]{20,}"),
    re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
]

def validate():
    if not (DIST / "index.html").is_file():
        raise ValueError("Missing compiled dist/index.html")
    readme = README.read_text(encoding="utf-8")
    if "sdk: static" not in readme or "app_file: dist/index.html" not in readme:
        raise ValueError("Expected static Space metadata is missing")
    for required in ("sw.js", "manifest.webmanifest", "library-icon.svg"):
        if not (DIST / required).is_file():
            raise ValueError(f"Offline app asset missing: {required}")
    shell = (DIST / "sw.js").read_text(encoding="utf-8")
    if "SHELL_CACHE" not in shell or "APP_FILES" not in shell or "request.mode === 'navigate'" not in shell:
        raise ValueError("Offline service worker missing expected app shell behaviour")
    files = [p for p in DIST.rglob("*") if p.is_file()]
    if not files:
        raise ValueError("Empty deployment directory")
    for p in files:
        if p.is_symlink() or not p.resolve().is_relative_to(DIST.resolve()):
            raise ValueError(f"Unsafe deployment path: {p}")
        if p.suffix.lower() in BLOCKED_SUFFIXES or p.suffix.lower() not in SAFE_SUFFIXES:
            raise ValueError(f"Unexpected deployment file type: {p.relative_to(DIST)}")
        if p.name.startswith(".") or any(part.startswith(".") for part in p.relative_to(DIST).parts):
            raise ValueError(f"Hidden file in deployment: {p}")
        data = p.read_bytes()
        if any(pattern.search(data) for pattern in SECRETS):
            raise ValueError(f"Possible credential in deployment: {p.relative_to(DIST)}")
    print(f"Prebuilt deployment package passed checks ({len(files)} files)")

if __name__ == "__main__":
    validate()
