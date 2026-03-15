#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.webp'}


def image_files(d: Path):
    if not d.exists():
        return []
    return sorted([p for p in d.rglob('*') if p.is_file() and p.suffix.lower() in IMAGE_EXTS])


def count_images(root: Path):
    buckets = {
        'model': root / 'model',
        'match': root / 'gallery' / 'match',
        'non_match': root / 'gallery' / 'non_match',
        'race_scene': root / 'gallery' / 'race_scene',
    }
    out = {}
    files = {}
    for k, d in buckets.items():
        bucket_files = image_files(d)
        files[k] = bucket_files
        out[k] = len(bucket_files)
    out['total_gallery'] = out['match'] + out['non_match'] + out['race_scene']
    out['total_all'] = out['model'] + out['total_gallery']
    return out, files


def validate_manifest(root: Path):
    manifest_path = root / 'manifest.json'
    if not manifest_path.exists():
        return {
            'exists': False,
            'errors': ['manifest.json is missing'],
            'entries_checked': 0,
        }

    try:
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    except Exception as e:
        return {
            'exists': True,
            'errors': [f'invalid manifest.json: {e}'],
            'entries_checked': 0,
        }

    errors = []
    checked = 0

    for entry in manifest.get('model', []):
        checked += 1
        rel = entry.get('file')
        if not rel or not (root / rel).exists():
            errors.append(f'missing model file referenced by manifest: {rel}')

    gallery = manifest.get('gallery', {})
    for bucket in ('match', 'non_match', 'multi_person', 'race_scene'):
        for entry in gallery.get(bucket, []):
            checked += 1
            rel = entry.get('file')
            if not rel or not (root / rel).exists():
                errors.append(f'missing {bucket} file referenced by manifest: {rel}')

    return {
        'exists': True,
        'errors': errors,
        'entries_checked': checked,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default='data/test/face-search')
    ap.add_argument('--expect-min-gallery', type=int, default=100)
    ap.add_argument('--expect-max-gallery', type=int, default=200)
    ap.add_argument('--min-model', type=int, default=1)
    ap.add_argument('--min-match', type=int, default=20)
    ap.add_argument('--min-non-match', type=int, default=40)
    ap.add_argument('--min-race-scene', type=int, default=10)
    args = ap.parse_args()

    root = Path(args.root)
    counts, _ = count_images(root)
    problems = []

    if counts['model'] < args.min_model:
        problems.append(f"too few model images (<{args.min_model})")
    if counts['match'] < args.min_match:
        problems.append(f"too few match images (<{args.min_match})")
    if counts['non_match'] < args.min_non_match:
        problems.append(f"too few non_match images (<{args.min_non_match})")
    if counts['race_scene'] < args.min_race_scene:
        problems.append(f"too few race_scene images (<{args.min_race_scene})")
    if counts['total_gallery'] < args.expect_min_gallery:
        problems.append(f'gallery too small (<{args.expect_min_gallery})')
    if counts['total_gallery'] > args.expect_max_gallery:
        problems.append(f'gallery too large (>{args.expect_max_gallery})')

    manifest = validate_manifest(root)
    problems.extend(manifest['errors'])

    result = {
        'root': str(root),
        'counts': counts,
        'manifest_exists': manifest['exists'],
        'manifest_entries_checked': manifest['entries_checked'],
        'thresholds': {
            'min_model': args.min_model,
            'min_match': args.min_match,
            'min_non_match': args.min_non_match,
            'min_race_scene': args.min_race_scene,
            'expect_min_gallery': args.expect_min_gallery,
            'expect_max_gallery': args.expect_max_gallery,
        },
        'ok': len(problems) == 0,
        'problems': problems,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
