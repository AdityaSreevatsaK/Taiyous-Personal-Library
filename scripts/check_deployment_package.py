"""Fail closed if the standalone Pages deployment package contains unsafe files."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
README = ROOT / "README.md"
SAFE_SUFFIXES = {".html", ".js", ".css", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".otf", ".map", ".json", ".webmanifest", ".txt"}
BLOCKED_SUFFIXES = {".epub", ".zip", ".env", ".pem", ".key", ".p12", ".pfx", ".db", ".sqlite"}
OAUTH_METADATA = Path("oauth-client.json")
PUBLIC_ORIGIN = "https://taiyous-personal-library.pages.dev"
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
    # Use a normal JSON asset; hidden /.well-known/ metadata fell back to SPA HTML.
    oauth_file = DIST / OAUTH_METADATA
    if not oauth_file.is_file() or oauth_file.is_symlink():
        raise ValueError("Missing public OAuth client metadata")
    try:
        oauth = json.loads(oauth_file.read_text(encoding="utf-8"))
    except (ValueError, UnicodeError) as exc:
        raise ValueError("Invalid OAuth client metadata JSON") from exc
    if (not isinstance(oauth, dict)
            or oauth.get("client_id") != PUBLIC_ORIGIN + "/oauth-client.json"
            or oauth.get("redirect_uris") != [PUBLIC_ORIGIN + "/api/oauth/callback"]
            or oauth.get("token_endpoint_auth_method") != "none"):
        raise ValueError("Unexpected public OAuth client configuration")
    if oauth_file.stat().st_size > 5120:
        raise ValueError("HF OAuth client metadata exceeds the 5 KiB provider limit")
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
        relative = p.relative_to(DIST)
        if p.suffix.lower() in BLOCKED_SUFFIXES or p.suffix.lower() not in SAFE_SUFFIXES:
            raise ValueError(f"Unexpected deployment file type: {relative}")
        if p.name.startswith(".") or any(part.startswith(".") for part in relative.parts):
            raise ValueError(f"Hidden file in deployment: {p}")
        data = p.read_bytes()
        if any(pattern.search(data) for pattern in SECRETS):
            raise ValueError(f"Possible credential in deployment: {p.relative_to(DIST)}")
    print(f"Prebuilt deployment package passed checks ({len(files)} files)")

if __name__ == "__main__":
    validate()
