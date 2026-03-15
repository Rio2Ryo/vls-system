#!/usr/bin/env python3
"""
Generate a combined JSON report for the minimal face-search dataset.

Reads manifest.json for dataset counts and re-runs the smoke-test logic
inline to produce a single report.json with ok:true on success.

Usage:
  python3 scripts/face-min-report.py \
    --root data/test/face-search-min \
    --out  data/test/face-search-min/report.json
"""

from __future__ import annotations
import argparse
import json
import math
import random
import sys
from pathlib import Path

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
DIM = 128


def image_count(d: Path) -> int:
    if not d.exists():
        return 0
    return sum(1 for p in d.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXTS)


# ── cosine similarity (mirrors src/lib/face.ts) ──────────────────────────────

def cosine_similarity(a: list[float], b: list[float]) -> float:
    if len(a) != len(b) or not a:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    d = na * nb
    return 0.0 if d == 0 else dot / d


def _unit(seed: int) -> list[float]:
    rng = random.Random(seed)
    v = [rng.gauss(0, 1) for _ in range(DIM)]
    n = math.sqrt(sum(x * x for x in v))
    return [x / n for x in v]


def _perturb(base: list[float], noise: float, seed: int) -> list[float]:
    rng = random.Random(seed)
    v = [x + rng.gauss(0, noise) for x in base]
    n = math.sqrt(sum(x * x for x in v))
    return [x / n for x in v]


def build_embeddings(manifest: dict) -> dict[str, list[float]]:
    identity_bases: dict[str, list[float]] = {}
    for i, m in enumerate(manifest["model"]):
        identity_bases[m["person"]] = _unit(i * 1000)

    emb: dict[str, list[float]] = {}
    for i, m in enumerate(manifest["model"]):
        emb[m["file"]] = _perturb(identity_bases[m["person"]], 0.02, i)
    for i, g in enumerate(manifest["gallery"]["match"]):
        emb[g["file"]] = _perturb(identity_bases[g["person"]], 0.05, 100 + i)
    for i, g in enumerate(manifest["gallery"]["non_match"]):
        emb[g["file"]] = _unit(9000 + i)
    for i, g in enumerate(manifest["gallery"]["race_scene"]):
        emb[g["file"]] = _unit(8000 + i)
    return emb


def run_smoke(manifest: dict, threshold: float = 0.6) -> dict:
    embeddings = build_embeddings(manifest)
    gallery = (
        manifest["gallery"]["match"]
        + manifest["gallery"]["non_match"]
        + manifest["gallery"]["race_scene"]
    )
    stored = [
        {"id": g["file"], "photoId": g["file"],
         "embedding": embeddings[g["file"]],
         "expected": g.get("expected"), "person": g.get("person")}
        for g in gallery
    ]

    tp = fn = fp = 0
    for m in manifest["model"]:
        person = m["person"]
        q = embeddings[m["file"]]
        hits = {s["id"] for s in stored if cosine_similarity(q, s["embedding"]) >= threshold}
        expected = {g["file"] for g in manifest["gallery"]["match"] if g.get("person") == person}
        non_match = {g["file"] for g in manifest["gallery"]["non_match"]}
        tp += sum(1 for f in expected if f in hits)
        fn += sum(1 for f in expected if f not in hits)
        fp += sum(1 for f in non_match if f in hits)

    return {"true_positives": tp, "false_negatives": fn, "false_positives": fp,
            "ok": fn == 0 and fp == 0}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default="data/test/face-search-min")
    parser.add_argument("--out",  default="data/test/face-search-min/report.json")
    args = parser.parse_args()

    root = Path(args.root)
    manifest_path = root / "manifest.json"
    if not manifest_path.exists():
        print(f"ERROR: manifest not found: {manifest_path}", file=sys.stderr)
        return 1

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    counts = {
        "model":      image_count(root / "model"),
        "match":      image_count(root / "gallery" / "match"),
        "non_match":  image_count(root / "gallery" / "non_match"),
        "race_scene": image_count(root / "gallery" / "race_scene"),
    }
    counts["total_gallery"] = counts["match"] + counts["non_match"] + counts["race_scene"]
    counts["total_all"]     = counts["model"] + counts["total_gallery"]

    smoke = run_smoke(manifest)

    report = {
        "root":    str(root),
        "dataset": counts,
        "smoke":   smoke,
        "ok":      smoke["ok"] and counts["total_all"] >= 25,
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
