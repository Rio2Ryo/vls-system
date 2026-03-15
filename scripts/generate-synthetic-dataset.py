#!/usr/bin/env python3
"""
Generate a minimal synthetic face-search test dataset without any external dependencies.

Creates 25 tiny PNG images (colored 64x64 squares with identity-coded pixel patterns)
and writes them into the expected directory layout so the prepare + check pipeline
can run end-to-end with zero downloads.

Usage:
  python3 scripts/generate-synthetic-dataset.py \
    [--out data/test/face-search-min] \
    [--seed 42]

Output layout:
  <out>/model/            3 images  (person_01..03)
  <out>/gallery/match/    6 images  (2 per identity)
  <out>/gallery/non_match/12 images
  <out>/gallery/race_scene/ 4 images
  <out>/manifest.json
  Total: 25 images
"""

from __future__ import annotations
import argparse
import json
import os
import random
import struct
import zlib
from pathlib import Path

# ---------------------------------------------------------------------------
# Minimal pure-stdlib PNG writer (no Pillow required)
# ---------------------------------------------------------------------------

def _png_chunk(tag: bytes, data: bytes) -> bytes:
    c = struct.pack(">I", len(data)) + tag + data
    crc = zlib.crc32(tag + data) & 0xFFFFFFFF
    return c + struct.pack(">I", crc)


def write_png(path: Path, width: int, height: int, rgb: tuple[int, int, int]) -> None:
    """Write a solid-color RGB PNG (with a small pixel mark to distinguish images)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    r, g, b = rgb

    # Build raw scanlines: filter byte 0 + RGB pixels
    scanlines = bytearray()
    for y in range(height):
        scanlines.append(0)  # filter type None
        for x in range(width):
            scanlines.extend([r, g, b])

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    idat_data = zlib.compress(bytes(scanlines))

    png = (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", ihdr)
        + _png_chunk(b"IDAT", idat_data)
        + _png_chunk(b"IEND", b"")
    )
    path.write_bytes(png)


# ---------------------------------------------------------------------------
# Palette: each identity gets a distinct hue so "same person" images share color
# ---------------------------------------------------------------------------

IDENTITY_COLORS: list[tuple[int, int, int]] = [
    (220,  80,  80),  # person_01 – red
    ( 80, 180,  80),  # person_02 – green
    ( 80, 120, 220),  # person_03 – blue
]

NON_MATCH_COLORS: list[tuple[int, int, int]] = [
    (200, 140,  60),
    (140,  60, 200),
    ( 60, 200, 200),
    (200, 200,  60),
    (180,  90, 130),
    (130, 180,  90),
    ( 90, 130, 180),
    (220, 160, 160),
    (160, 220, 160),
    (160, 160, 220),
    (200, 120,  80),
    (120,  80, 200),
]

RACE_COLORS: list[tuple[int, int, int]] = [
    (100, 100, 100),
    (150, 120,  90),
    ( 90, 150, 120),
    (120,  90, 150),
]


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate synthetic face-search test dataset")
    parser.add_argument("--out", default="data/test/face-search-min", help="Output directory")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--size", type=int, default=64, help="Image side length in pixels")
    args = parser.parse_args()

    random.seed(args.seed)
    out = Path(args.out)

    manifest: dict = {
        "source": {"type": "synthetic", "seed": args.seed},
        "seed": args.seed,
        "model": [],
        "gallery": {"match": [], "non_match": [], "multi_person": [], "race_scene": []},
    }

    # ---- model images (1 per identity) ------------------------------------
    for idx, color in enumerate(IDENTITY_COLORS, start=1):
        p = out / "model" / f"person_{idx:02d}.png"
        write_png(p, args.size, args.size, color)
        manifest["model"].append({"person": f"identity_{idx:02d}", "file": str(p.relative_to(out))})
        print(f"  wrote {p.relative_to(out)}")

    # ---- gallery/match (2 per identity) -----------------------------------
    for idx, color in enumerate(IDENTITY_COLORS, start=1):
        for j in range(1, 3):
            # Slightly lighter variant so files differ but color family matches
            r, g, b = color
            variant = (min(r + j * 15, 255), min(g + j * 15, 255), min(b + j * 15, 255))
            p = out / "gallery" / "match" / f"match_{idx:02d}_{j:02d}.png"
            write_png(p, args.size, args.size, variant)
            manifest["gallery"]["match"].append({
                "person": f"identity_{idx:02d}",
                "file": str(p.relative_to(out)),
                "expected": "match",
            })
            print(f"  wrote {p.relative_to(out)}")

    # ---- gallery/non_match (12 images) ------------------------------------
    for i, color in enumerate(NON_MATCH_COLORS, start=1):
        p = out / "gallery" / "non_match" / f"non_match_{i:03d}.png"
        write_png(p, args.size, args.size, color)
        manifest["gallery"]["non_match"].append({
            "person": f"other_{i:03d}",
            "file": str(p.relative_to(out)),
            "expected": "non_match",
        })
        print(f"  wrote {p.relative_to(out)}")

    # ---- gallery/race_scene (4 images) ------------------------------------
    for i, color in enumerate(RACE_COLORS, start=1):
        p = out / "gallery" / "race_scene" / f"race_{i:03d}.png"
        write_png(p, args.size, args.size, color)
        manifest["gallery"]["race_scene"].append({
            "file": str(p.relative_to(out)),
            "expected": "scene_mixed",
        })
        print(f"  wrote {p.relative_to(out)}")

    manifest["gallery"]["multi_person"] = manifest["gallery"]["race_scene"]

    counts = {
        "model": len(manifest["model"]),
        "match": len(manifest["gallery"]["match"]),
        "non_match": len(manifest["gallery"]["non_match"]),
        "race_scene": len(manifest["gallery"]["race_scene"]),
    }
    manifest["counts"] = counts
    manifest["total_gallery"] = counts["match"] + counts["non_match"] + counts["race_scene"]
    manifest["total_all"] = counts["model"] + manifest["total_gallery"]
    manifest["notes"] = [
        "Synthetic dataset: solid-color PNGs, no real faces.",
        "Replace with LFW images (bash scripts/download-lfw.sh) for real face-recognition testing.",
    ]

    (out / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    summary = {
        "out": str(out),
        "counts": counts,
        "total_gallery": manifest["total_gallery"],
        "total_all": manifest["total_all"],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
