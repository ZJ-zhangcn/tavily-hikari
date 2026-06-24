#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from PIL import Image


WEB_ROOT = Path(__file__).resolve().parent.parent
DIST_DIR = WEB_ROOT / "dist"
VITE_MANIFEST_PATH = DIST_DIR / ".vite" / "manifest.json"

PUBLIC_HTML_FILES = {
    "index.html",
    "console.html",
    "login.html",
    "registration-paused.html",
}
ADMIN_HTML_FILES = {"admin.html"}


def normalize(values: list[str]) -> list[str]:
    return sorted({value for value in values if value})


def collect_assets(manifest: dict[str, Any], html_files: set[str]) -> list[str]:
    files: set[str] = set(html_files)
    visited: set[str] = set()

    def visit(key: str) -> None:
        entry = manifest.get(key)
        if not isinstance(entry, dict):
            return
        file_name = entry.get("file")
        if isinstance(file_name, str) and file_name:
            if file_name in visited:
                return
            visited.add(file_name)
            files.add(file_name)
        for css_file in entry.get("css", []):
            if isinstance(css_file, str):
                files.add(css_file)
        for asset_file in entry.get("assets", []):
            if isinstance(asset_file, str):
                files.add(asset_file)
        for import_key in entry.get("imports", []):
            if isinstance(import_key, str):
                visit(import_key)
        for import_key in entry.get("dynamicImports", []):
            if isinstance(import_key, str):
                visit(import_key)

    for html_file in html_files:
        visit(html_file)

    return normalize(list(files))


def ensure_not_empty(name: str, values: list[str]) -> None:
    if not values:
        raise RuntimeError(f"PWA asset graph '{name}' is empty")


def draw_icon(prefix: str, source_file: Path) -> dict[str, str]:
    base = Image.open(source_file).convert("RGBA")
    output: dict[str, str] = {}
    pwa_dir = DIST_DIR / "pwa"
    pwa_dir.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        rel = f"pwa/{prefix}-{size}.png"
        base.resize((size, size), Image.Resampling.LANCZOS).save(DIST_DIR / rel)
        output[str(size)] = rel
    touch_rel = f"pwa/{prefix}-touch-icon.png"
    base.resize((180, 180), Image.Resampling.LANCZOS).save(DIST_DIR / touch_rel)
    output["touch"] = touch_rel
    return output


def hash_cache_key(values: list[str]) -> str:
    return hashlib.sha256("|".join(values).encode("utf-8")).hexdigest()[:12]


def make_manifest(name: str, short_name: str, start_url: str, scope: str, theme_color: str, background_color: str, icons: dict[str, str]) -> dict[str, Any]:
    return {
        "name": name,
        "short_name": short_name,
        "start_url": start_url,
        "scope": scope,
        "display": "standalone",
        "theme_color": theme_color,
        "background_color": background_color,
        "icons": [
            {
                "src": f"/{icons['192']}",
                "sizes": "192x192",
                "type": "image/png",
            },
            {
                "src": f"/{icons['512']}",
                "sizes": "512x512",
                "type": "image/png",
            },
        ],
    }


def make_service_worker(cache_name: str, files: list[str], offline_fallbacks: dict[str, str], reject_admin: bool) -> str:
    precache_urls = [f"/{file_name}" for file_name in files]
    return f"""const CACHE_NAME = {json.dumps(cache_name)};
const PRECACHE_URLS = {json.dumps(precache_urls, indent=2)};
const OFFLINE_FALLBACKS = {json.dumps(offline_fallbacks, indent=2)};

self.addEventListener('install', (event) => {{
  event.waitUntil((async () => {{
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE_URLS);
    await self.skipWaiting();
  }})());
}});

self.addEventListener('activate', (event) => {{
  event.waitUntil((async () => {{
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  }})());
}});

function isNetworkOnly(request, requestUrl) {{
  if (request.method !== 'GET') return true;
  if (requestUrl.pathname.startsWith('/api/')) return true;
  if (requestUrl.pathname === '/mcp' || requestUrl.pathname.startsWith('/mcp/')) return true;
  if (requestUrl.pathname.startsWith('/health')) return true;
  if (requestUrl.pathname.startsWith('/auth/')) return true;
  return false;
}}

function isPrecached(requestUrl) {{
  return PRECACHE_URLS.includes(requestUrl.pathname);
}}

function resolveOfflineFallback(pathname) {{
  if ({'pathname === "/admin" || pathname.startsWith("/admin/")' if reject_admin else 'false'}) {{
    return null;
  }}
  for (const [prefix, fallbackUrl] of Object.entries(OFFLINE_FALLBACKS)) {{
    if (pathname === prefix || pathname.startsWith(prefix)) {{
      return fallbackUrl;
    }}
  }}
  return null;
}}

self.addEventListener('fetch', (event) => {{
  const request = event.request;
  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (isNetworkOnly(request, requestUrl)) {{
    event.respondWith(fetch(request));
    return;
  }}

  if (request.mode === 'navigate' || request.destination === 'document') {{
    event.respondWith((async () => {{
      try {{
        return await fetch(request);
      }} catch (error) {{
        const cache = await caches.open(CACHE_NAME);
        const fallbackUrl = resolveOfflineFallback(requestUrl.pathname);
        if (fallbackUrl) {{
          const fallbackResponse = await cache.match(fallbackUrl);
          if (fallbackResponse) return fallbackResponse;
        }}
        throw error;
      }}
    }})());
    return;
  }}

  if (!isPrecached(requestUrl)) {{
    event.respondWith(fetch(request));
    return;
  }}

  event.respondWith((async () => {{
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(requestUrl.pathname);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {{
      cache.put(requestUrl.pathname, response.clone()).catch(() => {{}});
    }}
    return response;
  }})());
}});"""


def write_json(relative_path: str, value: Any) -> None:
    absolute_path = DIST_DIR / relative_path
    absolute_path.parent.mkdir(parents=True, exist_ok=True)
    absolute_path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def write_text(relative_path: str, value: str) -> None:
    absolute_path = DIST_DIR / relative_path
    absolute_path.parent.mkdir(parents=True, exist_ok=True)
    absolute_path.write_text(value, encoding="utf-8")


def main() -> None:
    manifest = json.loads(VITE_MANIFEST_PATH.read_text(encoding="utf-8"))
    public_files = collect_assets(manifest, PUBLIC_HTML_FILES)
    admin_files = collect_assets(manifest, ADMIN_HTML_FILES)
    ensure_not_empty("public", public_files)
    ensure_not_empty("admin", admin_files)

    source_icon = WEB_ROOT / "public" / "relay-mesh-icon.png"
    public_icons = draw_icon(prefix="public", source_file=source_icon)
    admin_icons = draw_icon(prefix="admin", source_file=source_icon)

    write_json(
        "manifest.webmanifest",
        make_manifest(
            name="Tavily Hikari",
            short_name="Hikari",
            start_url="/",
            scope="/",
            theme_color="#7c3aed",
            background_color="#f4f1fa",
            icons=public_icons,
        ),
    )
    write_json(
        "manifest-admin.webmanifest",
        make_manifest(
            name="Tavily Hikari Admin",
            short_name="Hikari Admin",
            start_url="/admin/",
            scope="/admin/",
            theme_color="#0ea5e9",
            background_color="#eef1fa",
            icons=admin_icons,
        ),
    )

    write_text(
        "sw-public.js",
        make_service_worker(
            cache_name=f"tavily-hikari-public-{hash_cache_key(public_files)}",
            files=public_files + [public_icons["192"], public_icons["512"], public_icons["touch"]],
            offline_fallbacks={
                "/console": "/console.html",
                "/login": "/login.html",
                "/registration-paused": "/registration-paused.html",
                "/": "/index.html",
            },
            reject_admin=True,
        ),
    )
    write_text(
        "sw-admin.js",
        make_service_worker(
            cache_name=f"tavily-hikari-admin-{hash_cache_key(admin_files)}",
            files=admin_files + [admin_icons["192"], admin_icons["512"], admin_icons["touch"]],
            offline_fallbacks={"/admin/": "/admin.html", "/admin": "/admin.html"},
            reject_admin=False,
        ),
    )

    write_json(
        "pwa/asset-graphs.json",
        {
            "generatedAt": "build-time",
            "public": {
                "manifest": "manifest.webmanifest",
                "serviceWorker": "sw-public.js",
                "files": public_files,
                "icons": public_icons,
            },
            "admin": {
                "manifest": "manifest-admin.webmanifest",
                "serviceWorker": "sw-admin.js",
                "files": admin_files,
                "icons": admin_icons,
            },
        },
    )
    print(f"[pwa] generated split PWA assets in {DIST_DIR}")


if __name__ == "__main__":
    main()
