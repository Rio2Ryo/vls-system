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
      - heading "Loading all event photos..." [level=1] [ref=e11]
      - paragraph [ref=e12]: Please wait a moment
    - progressbar "Loading" [ref=e14]:
      - generic [ref=e15]:
        - generic [ref=e16]: Loading
        - generic [ref=e17]: 9%
    - generic [ref=e21]:
      - paragraph [ref=e22]: Today's photos are a gift from すこやか保険グループ!
      - generic [ref=e23]:
        - paragraph [ref=e24]: Sponsored Ad
        - generic [ref=e25]:
          - iframe [ref=e26]:
            - generic "YouTube Video Player" [ref=f1e3]:
              - link "Watch on www.youtube.com" [ref=f1e6] [cursor=pointer]:
                - /url: https://www.youtube.com/watch?v=1DpRy6TFNVw
                - img
          - button "Turn sound on" [ref=e28] [cursor=pointer]:
            - generic [ref=e29]: 🔇
            - text: Tap to unmute
        - generic [ref=e30]: 11s left
    - button "View Photos →" [disabled] [ref=e32]
```