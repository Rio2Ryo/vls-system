# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "メインコンテンツへスキップ" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - alert [ref=e3]
  - main [ref=e5]:
    - generic [ref=e6]:
      - group "Language" [ref=e8]:
        - button "日本語" [ref=e9] [cursor=pointer]
        - button "English" [pressed] [ref=e10] [cursor=pointer]
      - generic [ref=e11]:
        - heading "Photos from 夏祭り 2026" [level=1] [ref=e12]
        - paragraph [ref=e13]: 0 photos found (preview)
      - button "顔で検索" [ref=e15] [cursor=pointer]:
        - generic [ref=e16]: 📸
        - generic [ref=e17]: 顔で検索
      - generic [ref=e18]:
        - button "Deselect all photos" [ref=e19] [cursor=pointer]: Deselect All
        - combobox "写真の並び順" [ref=e20]:
          - option "登録順" [selected]
          - option "おすすめ順"
      - generic [ref=e22]:
        - paragraph [ref=e23]: Select photos to download
        - button "Download Selected Photos →" [disabled] [ref=e24]
```