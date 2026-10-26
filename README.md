# Coding with AI

**[georgehanu.github.io](https://georgehanu.github.io/)**: every free guide by George Hanu ([@georgehanu](https://x.com/georgehanu)) in one place, grouped into series, with a [searchable list of every lesson](https://georgehanu.github.io/lessons/).

| Series | Guide | |
| --- | --- | --- |
| [Working with coding agents](https://georgehanu.github.io/series/use/) | [Beyond "It Works"](https://georgehanu.github.io/beyond-it-works/) | A workflow for getting reviewable changes out of AI coding agents |
| | [Prove It](https://georgehanu.github.io/prove-it/) | Skills and hooks that make your coding agent prove its work |
| | [Slop-Proof UI](https://georgehanu.github.io/slop-proof-ui/) | Make your agent's UI stop looking AI-made, and fail a check when it does |
| [How agents work](https://georgehanu.github.io/series/inside/) | [The Agent Loop](https://georgehanu.github.io/the-agent-loop/) | Build a mini coding agent in TypeScript, no framework |
| | [Harden Your Agent](https://georgehanu.github.io/harden-your-agent/) | Six defences a real agent needs, each proved by a test |
| [AI in real apps](https://georgehanu.github.io/series/apps/) | [AI Buttons](https://georgehanu.github.io/ai-buttons/) | Small AI features in a real web app, built as workflows |

## Adding a guide

Every page comes from the files in [`data/`](data/). The HTML, `sitemap.xml`, `robots.txt` and the share images are generated, so don't edit them by hand.

1. Add `data/guides/<id>.json` (copy an existing guide). The `id` inside must match the file name. Give each lesson 1 to 3 topics from the list below, and a `page` relative to the guide's `url` if it has its own page.
2. Add the id to a series in [`data/site.json`](data/site.json), or add a new series. Its position in the list makes it Part 1, Part 2, and so on.
3. Run `npm install` once, then `npm run check`. It checks the data, rebuilds the site and its share images, and checks that every link answers.

**Topics** (fixed): `coding-agents`, `agents`, `tool-calling`, `workflows`, `structured-output`, `evaluation`, `safety`, `human-in-the-loop`, `cost`, `prompting`, `planning`, `ux`.

The home page gets a **Latest** section, the 3 newest guides by `published`, automatically once there are 5 or more guides.

## Share images

Every build draws the link previews (1200×630) from the same data, with one template in [`scripts/og.mjs`](scripts/og.mjs): `og.png` for the home page (and every page without its own image), `og/<series>.png` for each series, and `og/guides/<id>.png` for each guide. The guide sites point their `og:image` at their file here, for the guide's home page and every lesson, so keep those paths stable.

The image shows the title and a short line from `"og": { "description": "…" }` in `data/site.json` (site and each series) or the guide's JSON. Without it, it falls back to the subtitle, the series blurb or the guide's promise. `npm run check` fails if an image is missing and warns when a guide page doesn't use its image.
