# Page snapshot

```yaml
- generic [ref=e1]:
  - link "メインコンテンツへスキップ" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - alert [ref=e3]
  - main [ref=e5]:
    - generic [ref=e6]:
      - heading "管理画面ログイン" [level=1] [ref=e7]
      - generic [ref=e8]:
        - generic [ref=e9]: 管理パスワード
        - textbox "管理パスワード" [ref=e10]: ADMIN_VLS_2026
        - button "ログイン" [active] [ref=e11] [cursor=pointer]
```