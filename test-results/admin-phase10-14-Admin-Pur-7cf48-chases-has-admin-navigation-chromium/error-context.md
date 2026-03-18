# Page snapshot

```yaml
- generic [ref=e1]:
  - link "メインコンテンツへスキップ" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - alert [ref=e3]
  - main [ref=e5]:
    - generic [ref=e6]:
      - heading "Admin Login" [level=1] [ref=e7]
      - generic [ref=e8]:
        - generic [ref=e9]: Admin Password
        - textbox "Admin Password" [active] [ref=e10]: ADMIN_VLS_2026
        - button "Log in" [ref=e11] [cursor=pointer]
```