# Page snapshot

```yaml
- generic [ref=e1]:
  - link "メインコンテンツへスキップ" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - alert [ref=e3]
  - main [ref=e5]:
    - group "Language" [ref=e7]:
      - button "日本語" [ref=e8] [cursor=pointer]
      - button "English" [pressed] [ref=e9] [cursor=pointer]
    - generic [ref=e10]:
      - img "Mirai Dev Lab ロゴ" [ref=e12]
      - heading "Mirai Dev Lab" [level=1] [ref=e13]
      - paragraph [ref=e14]: Event Photo Download Service
    - generic [ref=e16]:
      - generic [ref=e17]:
        - generic [ref=e18]: Access Password
        - textbox "Access Password" [active] [ref=e19]:
          - /placeholder: e.g. SUMMER2026
          - text: summer2026
      - button "View Photos →" [ref=e21] [cursor=pointer]
    - paragraph [ref=e22]: Enter the password provided by the event organizer
```