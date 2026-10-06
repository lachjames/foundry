# Foundry

Source for [foundry.sodalabs.io](https://foundry.sodalabs.io): engineering and research write-ups, built from Markdown by a few hundred lines of TypeScript and served from GitHub Pages.

## Writing a post

```sh
npm run new -- "Title of the post"   # creates content/posts/YYYY-MM-DD-title-of-the-post/index.md (draft)
npm run dev                          # http://localhost:4000, drafts visible, live reload
```

Write in `index.md`. Put images, data files and demos in the same folder and reference them relatively. When it's ready, set `draft: false` (or delete the line), commit, push to `main`. The workflow in `.github/workflows/deploy.yml` builds and deploys. That's the whole publishing process.

### Front matter

```yaml
---
title: "Hello, Foundry"            # required
date: 2026-10-06                   # required; drives ordering and the feed
summary: "One or two sentences."   # required; post list, RSS, OpenGraph description
tags: [meta, tooling]              # optional; tag pages are generated
draft: true                        # optional; drafts are excluded from production builds
updated: 2026-11-01                # optional; shown next to the publish date
image: cover.png                   # optional; social card image (relative to the post folder)
slug: custom-url-slug              # optional; default is the folder name minus its date prefix
---
```

### Conventions inside a post

- **Figures:** a paragraph containing only an image becomes a `<figure>`, with the alt text as the caption: `![Caption text](figure.png)`.
- **Code:** fenced blocks are highlighted with shiki at build time. Add a label after the language to name the file: ```` ```ts build/build.ts ````. Unknown languages fall back to plain text.
- **Maths:** `$inline$` and `$$display$$`, rendered with KaTeX at build time. The KaTeX stylesheet is only included on pages that use it.
- **Footnotes:** `[^name]` in the text, `[^name]: ...` anywhere in the file.
- **Headings:** `##` and `###` get anchor links and feed the table of contents (shown when there are three or more).
- **Demos:** put a self-contained `index.html` in the post folder (or a subfolder) and embed it: `<iframe class="demo" src="demo/index.html" height="360" title="..."></iframe>`. Raw HTML is allowed in Markdown.
- **Pages:** `content/pages/<name>.md` becomes `/<name>/`. Needs `title` in front matter.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Build with drafts, serve `dist/` on `PORT` (default 4000), rebuild and reload on change |
| `npm run build` | Production build into `dist/` (drafts excluded) |
| `npm run new -- "Title"` | Scaffold a draft post |
| `npm run check` | Typecheck the build scripts |
| `npm run clean` | Remove `dist/` |

The build runs directly on Node (>= 22.18) using native TypeScript type-stripping; there is no transpile step.

## How it works

```
content/
  posts/<date>-<slug>/index.md   one folder per post, assets alongside
  pages/<name>.md                standalone pages (about, etc.)
static/                          copied verbatim to the site root (CSS, favicon)
build/
  build.ts                       entry point: render everything into dist/
  content.ts                     load posts/pages, parse front matter, derive slugs
  markdown.ts                    markdown-it + shiki + KaTeX + footnotes + anchors + figures
  templates.ts                   HTML templates (layout, post, index, tags, 404)
  feeds.ts                       RSS and sitemap
  dev.ts                         dev server with live reload
  new.ts                         post scaffolder
site.config.ts                   title, URL, author, domain
```

Output: `/` (post list by year), `/posts/<slug>/`, `/tags/` and `/tags/<tag>/`, `/about/`, `/feed.xml`, `/sitemap.xml`, `/robots.txt`, `/404.html`, plus `CNAME` and `.nojekyll` for GitHub Pages.

Theme follows the operating system via `prefers-color-scheme`; there is no toggle and no client-side JavaScript on the site itself (the dev server injects a live-reload snippet locally only).

## One-time setup

1. **Create the repository** (e.g. `lachjames/foundry`) and push this folder to `main`. If the repo name differs, update `repo` in `site.config.ts`.
2. **GitHub Pages:** repository *Settings → Pages → Build and deployment → Source:* **GitHub Actions**. The first push to `main` runs the workflow and deploys.
3. **Custom domain:** still under *Settings → Pages*, enter `foundry.sodalabs.io` and save. (The build already writes `dist/CNAME`, so the setting survives deploys.)
4. **DNS:** add a `CNAME` record `foundry` → `lachjames.github.io`. If the zone is on Cloudflare, either leave the record **DNS only** (grey cloud), or if you proxy it, set SSL/TLS mode to **Full** to avoid redirect loops.
5. Once GitHub has provisioned the certificate (usually a few minutes), tick **Enforce HTTPS**.

After that, publishing is `git push`.
