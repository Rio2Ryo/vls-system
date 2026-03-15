# Face Search Test Data Plan

目的: 顔検索・顔照合のテスト用データをまず小さく確実に通し、その後 100〜200 枚規模へ拡張する。

## まずは最小成功セットで通す

最初の目標は **20〜30枚で1回生成・検品を通すこと**。

### 最小データセット案

- model: 3枚
- gallery/match: 6枚
- gallery/non_match: 12枚
- gallery/race_scene: 4枚

合計:
- gallery = 22枚
- total_all = 25枚

この構成なら、顔一致 / 不一致 / 複数人シーンの3パターンを小さく確認できる。

---

## 取得ルート案（最短）

### 1. LFW から single-person 画像を取る

用途:
- `model/`
- `gallery/match/`
- `gallery/non_match/`

最小セットで必要な条件:
- 3人分、各3枚以上ある人物
- さらに non_match 用に 12人分、各1枚以上

取得:

```bash
bash scripts/download-lfw.sh
```

想定配置:
- `data/raw/lfw/lfw_funneled/<Person_Name>/*.jpg`

### 2. race/event 画像は手動で 4枚だけ置く

配置先:
- `data/raw/manual_race_scenes/`

最初は大量に要らない。まず4枚でよい。

推奨条件:
- 複数人が写っている
- 走っている / イベント中 / 群衆 のどれか
- 顔が完全に潰れていない
- 利用許諾が明確な公開画像または自前画像

---

## まず通すコマンド

### 1. LFW を取得

```bash
bash scripts/download-lfw.sh
```

### 2. race/event 画像を4枚入れる

```bash
mkdir -p data/raw/manual_race_scenes
# ここに 4枚だけ jpg/png を置く
```

### 3. 最小セット生成

```bash
python3 scripts/prepare-face-test-data.py \
  --lfw-root data/raw/lfw/lfw_funneled \
  --out data/test/face-search-min \
  --same-identities 3 \
  --same-images-per-identity 3 \
  --single-non-match 12 \
  --multi-person 4 \
  --race-dir data/raw/manual_race_scenes
```

この設定で生成される想定:
- model: 3
- match: 6
- non_match: 12
- race_scene: 4
- total_gallery: 22

### 4. 最小セット用の緩い閾値で検品

```bash
python3 scripts/check-face-test-data.py \
  --root data/test/face-search-min \
  --min-model 3 \
  --min-match 6 \
  --min-non-match 12 \
  --min-race-scene 4 \
  --expect-min-gallery 20 \
  --expect-max-gallery 30
```

### 5. 梱包

```bash
bash scripts/package-face-test-data.sh \
  data/test/face-search-min \
  data/test/face-search-min-bundle.zip
```

---

## 通った後に増やす

最小セットが通ったら、次に 100〜200 枚構成へ拡張する。

拡張例:
- same-identities: 8
- same-images-per-identity: 6
- single-non-match: 80
- multi-person: 30

---

## 判定の考え方

### 正常系
- model と同一人物が `gallery/match/` から上位に出る
- `gallery/non_match/` の誤検出率が高すぎない
- `gallery/race_scene/` でも同一人物が写っていれば拾える

### 異常系 / 境界
- 複数人の中から誤って別人を拾わないか
- 小さい顔 / 横顔 / ブレ画像で極端に落ちないか
- モデル人物がいないときに false positive しすぎないか

---

## まだ残るブロッカー

- この環境では外部サイトから大規模公開画像を安定取得しづらい
- ただし **最小セットでは race/event 画像を4枚だけ手動投入すれば進められる**
- なので次の主作業は「大量収集」ではなく **最小セットを1回通すこと**
