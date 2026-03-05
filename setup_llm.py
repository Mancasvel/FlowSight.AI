"""
Setup script for FlowSight.AI local inference runtime.

Downloads:
  - llama.cpp prebuilt binaries (llama-server.exe) for Windows
  - InternVL2-1B GGUF model (ggml-org/InternVL2_5-1B-GGUF, Q4_K_M quant)

Run once before launching the app:
  python setup_llm.py
"""

import os
import requests
import zipfile


LLAMA_CPP_API = "https://api.github.com/repos/ggerganov/llama.cpp/releases/latest"
INTERNVL_MODEL_URL = (
    "https://huggingface.co/ggml-org/InternVL2_5-1B-GGUF/resolve/main/"
    "InternVL2_5-1B-Q4_K_M.gguf"
)
INTERNVL_MODEL_DEST = "local_llm/InternVL2_5-1B-Q4_K_M.gguf"
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


def download_internvl_model() -> bool:
    """Download InternVL2.5-1B Q4_K_M GGUF if not already present."""
    os.makedirs("local_llm", exist_ok=True)

    if os.path.exists(INTERNVL_MODEL_DEST):
        print(f"Model already exists: {INTERNVL_MODEL_DEST} — skipping download.")
        return True

    print(f"Downloading InternVL2_5-1B-Q4_K_M.gguf from HuggingFace...")
    try:
        r = requests.get(INTERNVL_MODEL_URL, stream=True, timeout=60)
        r.raise_for_status()
        with open(INTERNVL_MODEL_DEST, "wb") as f:
            downloaded = 0
            for chunk in r.iter_content(chunk_size=65536):
                f.write(chunk)
                downloaded += len(chunk)
                print(f"\r  {downloaded / 1_048_576:.1f} MB downloaded...", end="", flush=True)
        print(f"\nSaved to {INTERNVL_MODEL_DEST}")
        return True
    except Exception as e:
        print(f"\nError downloading model: {e}")
        return False


if __name__ == "__main__":
    os.makedirs(BIN_DIR, exist_ok=True)

    tag = get_latest_llama_release()
    if tag:
        download_llama_bin(tag)

    download_internvl_model()

    print("\nSetup complete. You can now launch the FlowSight.AI app.")
