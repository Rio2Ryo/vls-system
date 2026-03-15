#!/usr/bin/env python3
"""
Prepare public face-recognition test data for dai-vls.

What this script does:
1. Assumes a downloaded/extracted LFW dataset exists locally
2. Builds a curated test set with:
   - same-person images
   - different-person images
   - single-person and multi-person buckets
3. Optionally mixes in manually collected sports/race scene photos

Why this shape:
- LFW is good for identity matching tests
- real event/race scene photos are best added manually from approved/public sources
- this keeps licensing / privacy handling explicit

Expected input:
  data/raw/lfw/lfw_funneled/<Person_Name>/*.jpg

Output:
  data/test/face-search/
    model/
    gallery/match/
    gallery/non_match/
    gallery/multi_person/
    gallery/race_scene/
    manifest.json

Usage:
  python3 scripts/prepare-face-test-data.py \
    --lfw-root data/raw/lfw/lfw_funneled \
    --out data/test/face-search \
    --same-identities 8 \
    --same-images-per-identity 6 \
    --single-non-match 60 \
    --multi-person 20 \
    --race-dir data/raw/manual_race_scenes
"""

from __future__ import annotations

import argparse
import json
import random
import shutil
from pathlib import Path
from typing import List, Dict

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def list_images(d: Path) -> List[Path]:
    return sorted([p for p in d.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTS])


def safe_copy(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lfw-root", default="data/raw/lfw/lfw_funneled")
    ap.add_argument("--out", default="data/test/face-search")
    ap.add_argument("--same-identities", type=int, default=8)
    ap.add_argument("--same-images-per-identity", type=int, default=6)
    ap.add_argument("--single-non-match", type=int, default=60)
    ap.add_argument("--multi-person", type=int, default=20)
    ap.add_argument("--race-dir", default="data/raw/manual_race_scenes")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    random.seed(args.seed)

    lfw_root = Path(args.lfw_root)
    out = Path(args.out)
    race_dir = Path(args.race_dir)

    if not lfw_root.exists() or not any(lfw_root.iterdir() if lfw_root.exists() else []):
        result = json.dumps({"skipped": True, "reason": "lfw-root not found"}, ensure_ascii=False)
        print(result)
        return 0

    people_dirs = [d for d in sorted(lfw_root.iterdir()) if d.is_dir()]
    people = []
    for d in people_dirs:
        imgs = list_images(d)
        if len(imgs) >= max(2, args.same_images_per_identity):
            people.append((d.name, imgs))

    if len(people) < args.same_identities:
        raise SystemExit(
            f"Not enough identities with >= {args.same_images_per_identity} images. Have {len(people)}"
        )

    if out.exists():
        shutil.rmtree(out)
    (out / "model").mkdir(parents=True, exist_ok=True)
    (out / "gallery" / "match").mkdir(parents=True, exist_ok=True)
    (out / "gallery" / "non_match").mkdir(parents=True, exist_ok=True)
    (out / "gallery" / "multi_person").mkdir(parents=True, exist_ok=True)
    (out / "gallery" / "race_scene").mkdir(parents=True, exist_ok=True)

    selected_same = random.sample(people, args.same_identities)
    selected_names = {name for name, _ in selected_same}

    manifest: Dict[str, object] = {
        "source": {
            "lfw_root": str(lfw_root),
            "race_dir": str(race_dir),
        },
        "seed": args.seed,
        "model": [],
        "gallery": {
            "match": [],
            "non_match": [],
            "multi_person": [],
            "race_scene": [],
        },
    }

    # same-person bucket: one model image + N-1 gallery images per identity
    for idx, (person_name, imgs) in enumerate(selected_same, start=1):
        picked = random.sample(imgs, args.same_images_per_identity)
        model_img = picked[0]
        model_name = f"person_{idx:02d}{model_img.suffix.lower()}"
        safe_copy(model_img, out / "model" / model_name)
        manifest["model"].append({
            "person": person_name,
            "file": f"model/{model_name}",
            "source": str(model_img),
        })
        for j, img in enumerate(picked[1:], start=1):
            dst_name = f"match_{idx:02d}_{j:02d}{img.suffix.lower()}"
            safe_copy(img, out / "gallery" / "match" / dst_name)
            manifest["gallery"]["match"].append({
                "person": person_name,
                "file": f"gallery/match/{dst_name}",
                "source": str(img),
                "expected": "match",
            })

    # non-match bucket: one image each from identities not used above
    others = [(name, imgs) for name, imgs in people if name not in selected_names]
    random.shuffle(others)
    for idx, (person_name, imgs) in enumerate(others[: args.single_non_match], start=1):
        img = random.choice(imgs)
        dst_name = f"non_match_{idx:03d}{img.suffix.lower()}"
        safe_copy(img, out / "gallery" / "non_match" / dst_name)
        manifest["gallery"]["non_match"].append({
            "person": person_name,
            "file": f"gallery/non_match/{dst_name}",
            "source": str(img),
            "expected": "non_match",
        })

    # multi-person bucket: use manual scene photos if present
    race_imgs = []
    if race_dir.exists():
        race_imgs = []
        for ext in IMAGE_EXTS:
            race_imgs.extend(race_dir.rglob(f"*{ext}"))
        race_imgs = sorted(set(race_imgs))

    if race_imgs:
        random.shuffle(race_imgs)
        selected_race = race_imgs[: args.multi_person]
        for idx, img in enumerate(selected_race, start=1):
            dst_name = f"race_{idx:03d}{img.suffix.lower()}"
            safe_copy(img, out / "gallery" / "race_scene" / dst_name)
            manifest["gallery"]["race_scene"].append({
                "file": f"gallery/race_scene/{dst_name}",
                "source": str(img),
                "expected": "scene_mixed",
            })

    # multi_person aliases: race scenes are also multi-person if present
    manifest["gallery"]["multi_person"] = manifest["gallery"]["race_scene"]

    counts = {
        "model": len(manifest["model"]),
        "match": len(manifest["gallery"]["match"]),
        "non_match": len(manifest["gallery"]["non_match"]),
        "race_scene": len(manifest["gallery"]["race_scene"]),
    }
    manifest["counts"] = counts
    manifest["total_gallery"] = counts["match"] + counts["non_match"] + counts["race_scene"]
    manifest["notes"] = [
        "LFW gives identity-labeled face photos suitable for same/non-match testing.",
        "Race/event scene photos should be collected from approved public or owned sources and dropped into data/raw/manual_race_scenes.",
        "If you need 100-200 total gallery images, increase --single-non-match and add more race scene images.",
    ]

    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"out": str(out), "counts": counts, "total_gallery": manifest["total_gallery"]}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
