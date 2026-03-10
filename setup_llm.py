"""
Setup script for FlowSight.AI local inference runtime.

Downloads:
  - llama.cpp prebuilt binaries (llama-server.exe) for Windows
  - Qwen3-VL-2B-Instruct Q4_K_M GGUF (vision language model)
  - Qwen3-VL-2B-Instruct mmproj Q8_0 GGUF (vision projector, required for image analysis)

Model: https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF

Run once before launching the app:
  python setup_llm.py
"""

import os
import requests
import zipfile


LLAMA_CPP_API = "https://api.github.com/repos/ggerganov/llama.cpp/releases/latest"

HF_REPO = "Qwen/Qwen3-VL-2B-Instruct-GGUF"
MODEL_FILE = "Qwen3VL-2B-Instruct-Q4_K_M.gguf"
MMPROJ_FILE = "mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf"

MODEL_URL = f"https://huggingface.co/{HF_REPO}/resolve/main/{MODEL_FILE}"
MMPROJ_URL = f"https://huggingface.co/{HF_REPO}/resolve/main/{MMPROJ_FILE}"

MODEL_DEST = f"local_llm/{MODEL_FILE}"
MMPROJ_DEST = f"local_llm/{MMPROJ_FILE}"
BIN_DIR = "local_llm/bin"


def get_latest_llama_release() -> str | None:
    print("Finding latest llama.cpp release via GitHub API...")
    try:
        r = requests.get(LLAMA_CPP_API, timeout=15)
        r.raise_for_status()
        tag = r.json()["tag_name"]
        print(f"Latest release: {tag}")
        return tag
    except Exception as e:
        print(f"Error fetching release info: {e}")
        return None


def download_llama_bin(tag: str) -> bool:
    """Try to download CUDA 12.x, then CUDA 11, then AVX2 CPU-only binary."""
    base = f"https://github.com/ggerganov/llama.cpp/releases/download/{tag}"
    candidates = [
        f"llama-{tag}-bin-win-cuda-cu12.2.0-x64.zip",
        f"llama-{tag}-bin-win-cu12.4-x64.zip",
        f"llama-{tag}-bin-win-cuda-cu11.7.1-x64.zip",
        f"llama-{tag}-bin-win-avx2-x64.zip",
    ]

    for filename in candidates:
        url = f"{base}/{filename}"
        print(f"Trying: {url}")
        r = requests.get(url, stream=True, timeout=30)
        if r.status_code == 200:
            zip_path = filename
            print(f"Downloading {filename}...")
            with open(zip_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
            print("Extracting to local_llm/bin/...")
            os.makedirs(BIN_DIR, exist_ok=True)
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(BIN_DIR)
            os.remove(zip_path)
            print("llama.cpp binaries ready.")
            return True

    print("Could not download any llama.cpp binary. Check release page manually.")
    return False


def download_file(url: str, dest: str, label: str) -> bool:
    """Download a single file from a URL, skip if already present."""
    os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)

    if os.path.exists(dest):
        size_mb = os.path.getsize(dest) / 1_048_576
        print(f"{label} already exists: {dest} ({size_mb:.1f} MB) — skipping.")
        return True

    print(f"Downloading {label}...")
    try:
        r = requests.get(url, stream=True, timeout=60)
        r.raise_for_status()
        total = int(r.headers.get("content-length", 0))
        with open(dest, "wb") as f:
            downloaded = 0
            for chunk in r.iter_content(chunk_size=65536):
                f.write(chunk)
                downloaded += len(chunk)
                if total > 0:
                    pct = downloaded * 100 / total
                    print(f"\r  {downloaded / 1_048_576:.1f} / {total / 1_048_576:.1f} MB ({pct:.0f}%)", end="", flush=True)
                else:
                    print(f"\r  {downloaded / 1_048_576:.1f} MB downloaded...", end="", flush=True)
        print(f"\nSaved to {dest}")
        return True
    except Exception as e:
        print(f"\nError downloading {label}: {e}")
        if os.path.exists(dest):
            os.remove(dest)
        return False


if __name__ == "__main__":
    os.makedirs(BIN_DIR, exist_ok=True)

    tag = get_latest_llama_release()
    if tag:
        download_llama_bin(tag)

    download_file(MODEL_URL, MODEL_DEST, f"Qwen3-VL-2B model ({MODEL_FILE})")
    download_file(MMPROJ_URL, MMPROJ_DEST, f"Qwen3-VL-2B vision projector ({MMPROJ_FILE})")

    print("\nSetup complete. You can now launch the FlowSight.AI app.")
