#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-data/test/face-search}"
OUT="${2:-data/test/face-search-bundle.zip}"
if [ ! -d "$ROOT" ]; then
  echo "missing root: $ROOT" >&2
  exit 1
fi
ROOT_ABS="$(python3 -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "$ROOT")"
OUT_ABS="$(python3 -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "$OUT")"
cd "$(dirname "$ROOT_ABS")"
BASE="$(basename "$ROOT_ABS")"
rm -f "$OUT_ABS"
mkdir -p "$(dirname "$OUT_ABS")"
if command -v zip >/dev/null 2>&1; then
  zip -r "$OUT_ABS" "$BASE" >/dev/null
else
  python3 - "$BASE" "$OUT_ABS" <<'PY'
import sys, zipfile
from pathlib import Path
base = Path(sys.argv[1])
out = Path(sys.argv[2])
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
    for p in base.rglob('*'):
        if p.is_file():
            zf.write(p, p.as_posix())
PY
fi
printf 'created: %s\n' "$OUT_ABS"
