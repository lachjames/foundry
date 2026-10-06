#!/usr/bin/env node
/**
 * Scaffold a post: `npm run new -- "Title of the post"`
 * Creates content/posts/YYYY-MM-DD-title-of-the-post/index.md as a draft.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { paths, slugify } from './content.ts';

const title = process.argv.slice(2).join(' ').trim();
if (!title) {
  console.error('Usage: npm run new -- "Post title"');
  process.exit(1);
}

const now = new Date();
const yyyy = now.getFullYear();
const mm = String(now.getMonth() + 1).padStart(2, '0');
const dd = String(now.getDate()).padStart(2, '0');
const date = `${yyyy}-${mm}-${dd}`;
const slug = slugify(title);
const dir = path.join(paths.posts, `${date}-${slug}`);

try {
  await fs.access(dir);
  console.error(`Already exists: ${path.relative(paths.root, dir)}`);
  process.exit(1);
} catch {
  // does not exist, good
}

const frontMatter = `---
title: "${title.replace(/"/g, '\\"')}"
date: ${date}
summary: "One or two sentences that appear in the post list, the feed, and link previews."
tags: []
draft: true
---

Start writing. Drop images, data and demos next to this file and reference them
relatively, e.g. \`![Caption](figure.png)\`.
`;

await fs.mkdir(dir, { recursive: true });
await fs.writeFile(path.join(dir, 'index.md'), frontMatter, 'utf8');
console.log(`Created ${path.relative(paths.root, path.join(dir, 'index.md'))}`);
console.log(`It will appear at /posts/${slug}/ (drafts show in \`npm run dev\`, not in production builds).`);
