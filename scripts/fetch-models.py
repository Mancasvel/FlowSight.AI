"""
Prebuild hook: ensures the local LLM vision weights (.gguf) are present in
`local_llm/` before `cargo tauri build` bundles them into the installer.

Design decisions (why this script exists):
  * GitHub no acepta ficheros > 100 MB en un push normal. Los pesos
    (Qwen3-VL-2B Q3_K_M = 939 MB, mmproj Q8_0 = 445 MB) viven como
    *assets* de un GitHub Release y se bajan on-demand.
  * `bin/` (llama-server.exe + DLLs) SI est\u00e1 en el repo porque cabe.
  * Idempotente: si los ficheros ya existen con tama\u00f1o > 0 sale sin tocar
    red. Cero fricci\u00f3n en builds incrementales.
  * Zero-deps: solo stdlib (urllib). No requiere `pip install`.

Usage:
    python scripts/fetch-models.py
    python scripts/fetch-models.py --force     # re-descarga aunque existan
    python scripts/fetch-models.py --check     # solo verifica, no descarga

Tag override: se puede fijar v\u00eda env var FLOWSIGHT_MODELS_TAG o editando
MODELS_TAG m\u00e1s abajo. Repo override: FLOWSIGHT_MODELS_REPO.

Private repos: si el Release es privado, exporta GITHUB_TOKEN (o ten\u00e9
instalado `gh` con sesi\u00f3n activa, el script lo descubre autom\u00e1ticamente).
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path


# ---- CONFIGURATION -------------------------------------------------------

DEFAULT_REPO = "Mancasvel/FlowSight.AI"
DEFAULT_TAG = "models-v0.1.0"

# Asset name -> destination relative to repo root. El nombre en el asset de
# Release DEBE coincidir con el nombre que subi\u00f3s con `gh release upload`.
ASSETS: dict[str, Path] = {
    "Qwen3-VL-2B-Instruct-Q3_K_M.gguf": Path("local_llm/Qwen3-VL-2B-Instruct-Q3_K_M.gguf"),
    "mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf": Path("local_llm/mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf"),
}

MIN_SIZE_BYTES = 1_000_000  # < 1 MB = sospechoso (probablemente HTML de error)

# ---- HELPERS -------------------------------------------------------------

def repo_root() -> Path:
    """Devuelve la ra\u00edz del repo (directorio que contiene .git)."""
    here = Path(__file__).resolve().parent
    for candidate in [here, *here.parents]:
        if (candidate / ".git").exists():
            return candidate
    # Fallback: asume scripts/ vive justo debajo de la ra\u00edz.
    return here.parent


def resolve_github_token() -> str | None:
    """Intenta descubrir un token para Releases privados.

    Orden de prioridad:
      1. $GITHUB_TOKEN (CI estandar).
      2. $GH_TOKEN (alias de gh CLI).
      3. `gh auth token` (si el usuario tiene gh CLI logueado).
    """
    for var in ("GITHUB_TOKEN", "GH_TOKEN"):
        tok = os.environ.get(var)
        if tok:
            return tok.strip()
    if shutil.which("gh"):
        try:
            out = subprocess.run(
                ["gh", "auth", "token"],
                capture_output=True, text=True, timeout=10, check=True,
            )
            tok = out.stdout.strip()
            if tok:
                return tok
        except (subprocess.SubprocessError, OSError):
            pass
    return None


def asset_url(repo: str, tag: str, name: str) -> str:
    return f"https://github.com/{repo}/releases/download/{tag}/{name}"


def human_size(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def download(url: str, dest: Path, token: str | None) -> None:
    """Descarga con progreso a stdout. Escribe a <dest>.part y mueve atomico.

    Usa una redirect-following GET. Los Release assets redirigen a S3 con
    una signed URL; urllib respeta 302 por defecto pero descarta el header
    Authorization en cross-host redirects (comportamiento correcto para no
    filtrar el token a S3).
    """
    tmp = dest.with_suffix(dest.suffix + ".part")
    dest.parent.mkdir(parents=True, exist_ok=True)

    headers = {"Accept": "application/octet-stream", "User-Agent": "flowsight-fetch-models"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp:
        total = int(resp.headers.get("Content-Length", 0))
        downloaded = 0
        chunk = 1 << 16  # 64 KB

        with open(tmp, "wb") as f:
            while True:
                buf = resp.read(chunk)
                if not buf:
                    break
                f.write(buf)
                downloaded += len(buf)
                if total:
                    pct = downloaded * 100 / total
                    print(
                        f"  {human_size(downloaded)} / {human_size(total)} "
                        f"({pct:5.1f}%)",
                        end="\r", flush=True,
                    )
                else:
                    print(f"  {human_size(downloaded)}", end="\r", flush=True)

    print()  # newline after progress
    if tmp.stat().st_size < MIN_SIZE_BYTES:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(
            f"Downloaded file is suspiciously small (< {human_size(MIN_SIZE_BYTES)}). "
            "Probably an HTML error page. Check tag and permissions."
        )
    tmp.replace(dest)


def ok(path: Path) -> bool:
    return path.exists() and path.stat().st_size >= MIN_SIZE_BYTES


# ---- MAIN ----------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--force", action="store_true", help="re-download even if present")
    parser.add_argument("--check", action="store_true", help="only verify, do not download")
    args = parser.parse_args()

    repo = os.environ.get("FLOWSIGHT_MODELS_REPO", DEFAULT_REPO)
    tag = os.environ.get("FLOWSIGHT_MODELS_TAG", DEFAULT_TAG)
    root = repo_root()

    print(f"[fetch-models] repo={repo} tag={tag}")
    print(f"[fetch-models] root={root}")

    missing: list[tuple[str, Path]] = []
    for name, rel in ASSETS.items():
        dest = root / rel
        if args.force or not ok(dest):
            missing.append((name, dest))
        else:
            print(f"  OK    {rel} ({human_size(dest.stat().st_size)})")

    if not missing:
        print("[fetch-models] all assets present.")
        return 0

    if args.check:
        print("[fetch-models] MISSING (--check):")
        for name, dest in missing:
            print(f"  -- {dest}")
        return 1

    token = resolve_github_token()
    if token:
        print("[fetch-models] using auth token from env/gh")

    for name, dest in missing:
        url = asset_url(repo, tag, name)
        print(f"[fetch-models] downloading {name}")
        print(f"  from {url}")
        print(f"  to   {dest}")
        try:
            download(url, dest, token)
        except urllib.error.HTTPError as e:
            print(f"  HTTP {e.code} {e.reason}", file=sys.stderr)
            if e.code == 404:
                print(
                    f"  Release '{tag}' o asset '{name}' no existe en {repo}.\n"
                    f"  Subilo con:\n"
                    f"    gh release create {tag} local_llm/{name} "
                    f"--title 'Local LLM weights' --notes 'initial'",
                    file=sys.stderr,
                )
            elif e.code in (401, 403):
                print(
                    "  Auth fallo\u0301. Si el Release es privado, exporta "
                    "GITHUB_TOKEN o corre `gh auth login`.",
                    file=sys.stderr,
                )
            return 2
        except (urllib.error.URLError, RuntimeError, OSError) as e:
            print(f"  ERROR: {e}", file=sys.stderr)
            return 2

    print("[fetch-models] done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
