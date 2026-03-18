# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "メインコンテンツへスキップ" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - alert [ref=e3]
  - main [ref=e5]:
    - group "Language" [ref=e7]:
      - button "日本語" [ref=e8] [cursor=pointer]
      - button "English" [pressed] [ref=e9] [cursor=pointer]
    - generic [ref=e10]:
      - heading "Generating high-quality images..." [level=1] [ref=e11]
      - paragraph [ref=e12]: Almost done
    - progressbar "Generating" [ref=e14]:
      - generic [ref=e15]:
        - generic [ref=e16]: Generating
        - generic [ref=e17]: 7%
    - generic [ref=e22]:
      - paragraph [ref=e23]: A message from ファミリートラベル
      - generic [ref=e24]:
        - iframe [ref=e25]:
          - generic [active] [ref=f1e1]:
            - generic "YouTube Video Player" [ref=f1e3]
            - button "Show player controls" [ref=f1e7] [cursor=pointer]
        - button "Turn sound on" [ref=e27] [cursor=pointer]:
          - generic [ref=e28]: 🔇
          - text: Tap to unmute
      - generic [ref=e29]: 56s left
    - button "Proceed to Download →" [disabled] [ref=e31]
```