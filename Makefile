# Minimal face-search dataset pipeline
# Run all three steps in order:
#   make face-min

FACE_MIN_OUT := data/test/face-search-min

.PHONY: face-min face-generate face-check face-smoke face-ci

face-min: face-generate face-check face-smoke

face-generate:
	python3 scripts/generate-synthetic-dataset.py --out $(FACE_MIN_OUT)

face-check:
	python3 scripts/check-face-test-data.py \
	  --root $(FACE_MIN_OUT) \
	  --min-model 3 \
	  --min-match 6 \
	  --min-non-match 12 \
	  --min-race-scene 4 \
	  --expect-min-gallery 20 \
	  --expect-max-gallery 30

face-smoke:
	python3 scripts/smoke-test-face-search.py --root $(FACE_MIN_OUT)

face-ci: face-generate face-check face-smoke
	@python3 -c "import json; m=json.load(open('$(FACE_MIN_OUT)/manifest.json')); print('face-ci: PASS', m.get('total_all', m['counts']['model']+m['total_gallery']), 'images')"
