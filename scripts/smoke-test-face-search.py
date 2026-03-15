#!/usr/bin/env python3
"""
Smoke-test the face search pipeline against the minimal synthetic dataset.

Mirrors src/lib/face.ts:cosineSimilarity + searchEmbeddings in Python.
Assigns synthetic 128-dim embeddings per identity, then verifies:
  - gallery/match  images score >= threshold (should match)
  - gallery/non_match images score < threshold (should not match)

Exit code 0 = pass, 1 = failures found.

Usage:
  python3 scripts/smoke-test-face-search.py [--root data/test/face-search-min] [--threshold 0.6]
"""

from __future__ import annotations
import argparse
import json
import math
import random
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Mirror of src/lib/face.ts
# ---------------------------------------------------------------------------

def cosine_similarity(a: list[float], b: list[float]) -> float:
    if len(a) != len(b) or len(a) == 0:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    denom = norm_a * norm_b
    return 0.0 if denom == 0 else dot / denom


def search_embeddings(
    query: list[float],
    stored: list[dict],
    threshold: float = 0.6,
) -> list[dict]:
    results = []
    for s in stored:
        sim = cosine_similarity(query, s["embedding"])
        if sim >= threshold:
            results.append({**s, "similarity": round(sim * 10000) / 10000})
    return sorted(results, key=lambda r: r["similarity"], reverse=True)


# ---------------------------------------------------------------------------
# Synthetic embedding helpers
# ---------------------------------------------------------------------------

DIM = 128

def _unit_vec(seed_val: int) -> list[float]:
    """Deterministic unit vector seeded by an integer."""
    rng = random.Random(seed_val)
    v = [rng.gauss(0, 1) for _ in range(DIM)]
    norm = math.sqrt(sum(x * x for x in v))
    return [x / norm for x in v]


def _perturb(base: list[float], noise: float, seed_val: int) -> list[float]:
    """Add small Gaussian noise to a unit vector and re-normalise."""
    rng = random.Random(seed_val)
    v = [x + rng.gauss(0, noise) for x in base]
    norm = math.sqrt(sum(x * x for x in v))
    return [x / norm for x in v]


def build_embeddings(manifest: dict) -> dict[str, list[float]]:
    """
    Assign embeddings per file path.

    - model images and gallery/match for the same identity share a base vector
      (with tiny perturbation → high cosine similarity).
    - gallery/non_match get completely independent vectors
      (orthogonal-ish → low cosine similarity).
    """
    # Collect identity → base vector
    identity_bases: dict[str, list[float]] = {}
    for i, m in enumerate(manifest["model"]):
        person = m["person"]
        identity_bases[person] = _unit_vec(i * 1000)

    embeddings: dict[str, list[float]] = {}

    # Model images: base + tiny noise
    for i, m in enumerate(manifest["model"]):
        embeddings[m["file"]] = _perturb(identity_bases[m["person"]], noise=0.02, seed_val=i)

    # Match images: same identity base + tiny noise → similarity ~0.97+
    for i, g in enumerate(manifest["gallery"]["match"]):
        base = identity_bases[g["person"]]
        embeddings[g["file"]] = _perturb(base, noise=0.05, seed_val=100 + i)

    # Non-match: fully independent random vectors → orthogonal
    for i, g in enumerate(manifest["gallery"]["non_match"]):
        embeddings[g["file"]] = _unit_vec(9000 + i)

    # Race/scene: independent (multi-person chaos)
    for i, g in enumerate(manifest["gallery"]["race_scene"]):
        embeddings[g["file"]] = _unit_vec(8000 + i)

    return embeddings


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default="data/test/face-search-min")
    parser.add_argument("--threshold", type=float, default=0.6)
    args = parser.parse_args()

    root = Path(args.root)
    manifest_path = root / "manifest.json"
    if not manifest_path.exists():
        print(f"ERROR: manifest not found: {manifest_path}", file=sys.stderr)
        return 1

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    embeddings = build_embeddings(manifest)

    # Build the "stored" gallery (match + non_match + race_scene)
    gallery_entries = []
    for g in manifest["gallery"]["match"] + manifest["gallery"]["non_match"] + manifest["gallery"]["race_scene"]:
        gallery_entries.append({
            "id": g["file"],
            "photoId": g["file"],
            "embedding": embeddings[g["file"]],
            "expected": g.get("expected"),
            "person": g.get("person"),
        })

    failures = []
    total_model = 0
    true_positives = 0
    false_negatives = 0
    false_positives = 0

    for model_entry in manifest["model"]:
        person = model_entry["person"]
        query_emb = embeddings[model_entry["file"]]
        results = search_embeddings(query_emb, gallery_entries, threshold=args.threshold)
        result_ids = {r["id"] for r in results}

        # Expected matches: same person in gallery/match
        expected_matches = {
            g["file"] for g in manifest["gallery"]["match"] if g.get("person") == person
        }
        expected_non_matches = {
            g["file"] for g in manifest["gallery"]["non_match"]
        }

        total_model += 1

        for f in expected_matches:
            if f not in result_ids:
                false_negatives += 1
                failures.append(f"FALSE NEGATIVE: {model_entry['file']} did not match {f}")
            else:
                true_positives += 1

        for f in expected_non_matches:
            if f in result_ids:
                false_positives += 1
                sim = next(r["similarity"] for r in results if r["id"] == f)
                failures.append(f"FALSE POSITIVE: {model_entry['file']} matched non_match {f} (sim={sim})")

        # Print per-model summary
        matched_persons = sorted({r.get("person","?") for r in results if r["photoId"] in expected_matches})
        print(f"  model:{model_entry['file']}  matches={len([r for r in results if r['id'] in expected_matches])}/{len(expected_matches)}  fp={len([r for r in results if r['id'] in expected_non_matches])}")

    summary = {
        "root": str(root),
        "threshold": args.threshold,
        "model_images": total_model,
        "true_positives": true_positives,
        "false_negatives": false_negatives,
        "false_positives": false_positives,
        "failures": len(failures),
        "ok": len(failures) == 0,
    }
    print(json.dumps(summary, indent=2))

    if failures:
        for f in failures:
            print(f"  {f}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
