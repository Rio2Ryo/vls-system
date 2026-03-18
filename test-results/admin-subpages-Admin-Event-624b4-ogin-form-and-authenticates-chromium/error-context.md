# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "メインコンテンツへスキップ" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - alert [ref=e3]
  - main [ref=e5]:
    - generic [ref=e6]:
      - heading "Admin Login" [level=1] [ref=e7]
      - generic [ref=e8]:
        - generic [ref=e9]: Admin Password
        - textbox "Admin Password" [ref=e10]
        - button "Log in" [ref=e11] [cursor=pointer]
```