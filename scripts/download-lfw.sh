#!/usr/bin/env bash
set -euo pipefail

URL="${1:-https://vis-www.cs.umass.edu/lfw/lfw-funneled.tgz}"
OUT_DIR="${2:-data/raw/lfw}"
ARCHIVE="$OUT_DIR/lfw-funneled.tgz"
EXTRACTED_DIR="$OUT_DIR/lfw_funneled"

mkdir -p "$OUT_DIR"

if [ -d "$EXTRACTED_DIR" ] && [ "$(find "$EXTRACTED_DIR" -mindepth 1 -maxdepth 1 | wc -l)" -gt 0 ]; then
  echo "already exists: $EXTRACTED_DIR"
  exit 0
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl not found" >&2
  exit 1
fi
if ! command -v tar >/dev/null 2>&1; then
  echo "tar not found" >&2
  exit 1
fi

if [ ! -f "$ARCHIVE" ]; then
  echo "downloading: $URL"
  curl -fL "$URL" -o "$ARCHIVE"
else
  echo "archive exists: $ARCHIVE"
fi

echo "extracting: $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$OUT_DIR"

if [ ! -d "$EXTRACTED_DIR" ]; then
  echo "extract failed: missing $EXTRACTED_DIR" >&2
  exit 1
fi

COUNT=$(find "$EXTRACTED_DIR" -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' \) | wc -l)
echo "ready: $EXTRACTED_DIR ($COUNT images)"
