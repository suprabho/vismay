# Studio Story Embed

The home page (`/`) includes a live preview of the *vizmaya-studio* board, an
HTML story in the board format, inside a browser-chrome frame
(`apps/vizmaya-fyi/components/HomeClient.tsx`).

```
<section .story-embed>
  <div .story-embed-inner>
    <div .story-embed-frame>         ← border-radius + shadow (browser chrome)
      <div .story-embed-bar>         ← traffic-light dots + URL pill (links to /s/vizmaya-studio)
      <div .story-embed-iframe-wrap>
        <iframe src="/s/vizmaya-studio?embed=1" />
```

- `/s/<slug>?embed=1` serves the published HTML story without the site header
  and footer (`packages/html-stories/src/serve.ts`), so the stage fills the frame.
- The iframe is interactive. The board runtime leaves a plain wheel and
  one-finger drag to the page, so the home page keeps scrolling past it, and
  takes ⌘/Ctrl + wheel, a trackpad pinch or two fingers to move the board.
  Clicking a card or using the tour panel flies the camera.
- The source of the board is
  `apps/vizmaya-fyi/content/stories/vizmaya-studio/vizmaya-studio-board.html`;
  the embed shows whatever is published under the `vizmaya-studio` slug.

This replaces the earlier embed of the React story at `/story/vizmaya-studio`,
which pinned the frame in a tall wrapper and mirrored page scroll into the
story with `viz-story-progress` messages.
