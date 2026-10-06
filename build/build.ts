#!/usr/bin/env node
/**
 * Static site build. Usage:
 *   node build/build.ts            production build (drafts excluded)
 *   node build/build.ts --drafts   include posts marked `draft: true`
 *
 * Reads content/ and static/, writes dist/. The whole site is this file plus
 * content.ts (loading), markdown.ts (rendering), templates.ts (HTML) and feeds.ts.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { site } from '../site.config.ts';
import { collectTags, loadPages, loadPosts, paths } from './content.ts';
import { rssFeed, sitemap } from './feeds.ts';
import { createRenderer } from './markdown.ts';
import { indexPage, notFoundPage, postPage, standalonePage, tagPage, tagsIndexPage } from './templates.ts';

const includeDrafts = process.argv.includes('--drafts');

async function writeFile(relative: string, content: string): Promise<void> {
  const target = path.join(paths.dist, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

async function copyDir(from: string, to: string, filter?: (src: string) => boolean): Promise<void> {
  try {
    await fs.access(from);
  } catch {
    return;
  }
  await fs.cp(from, to, { recursive: true, filter: filter ? (src) => filter(src) : undefined });
}

async function copyKatexAssets(): Promise<void> {
  const from = path.join(paths.nodeModules, 'katex', 'dist');
  const to = path.join(paths.dist, 'assets', 'katex');
  await fs.mkdir(to, { recursive: true });
  await fs.copyFile(path.join(from, 'katex.min.css'), path.join(to, 'katex.min.css'));
  await copyDir(path.join(from, 'fonts'), path.join(to, 'fonts'), (src) => !src.endsWith('.ttf'));
}

async function main(): Promise<void> {
  const started = performance.now();
  console.log(`Building ${site.title} (${site.url})${includeDrafts ? ' with drafts' : ''}`);

  await fs.rm(paths.dist, { recursive: true, force: true });
  await fs.mkdir(paths.dist, { recursive: true });

  const [posts, pages, renderer] = await Promise.all([loadPosts({ includeDrafts }), loadPages(), createRenderer()]);
  const tags = collectTags(posts);
  const tagSlugs = new Map(tags.map((t) => [t.tag, t.slug]));

  // Posts: render markdown, write HTML, copy sibling assets (images, demos, data).
  const renderedPosts: { post: (typeof posts)[number]; html: string }[] = [];
  for (const post of posts) {
    const rendered = await renderer.render(post.markdown);
    await writeFile(path.join('posts', post.slug, 'index.html'), postPage(post, rendered, tagSlugs));
    await copyDir(post.sourceDir, path.join(paths.dist, 'posts', post.slug), (src) => {
      const name = path.basename(src);
      return name !== 'index.md' && !name.startsWith('.');
    });
    renderedPosts.push({ post, html: rendered.html });
    console.log(`  post  ${post.url}${post.draft ? '  (draft)' : ''}`);
  }

  for (const page of pages) {
    const rendered = await renderer.render(page.markdown);
    await writeFile(path.join(page.slug, 'index.html'), standalonePage(page, rendered));
    console.log(`  page  ${page.url}`);
  }

  await writeFile('index.html', indexPage(posts, tagSlugs));
  await writeFile(path.join('tags', 'index.html'), tagsIndexPage(tags));
  for (const tag of tags) {
    await writeFile(path.join('tags', tag.slug, 'index.html'), tagPage(tag, tagSlugs));
  }
  await writeFile('404.html', notFoundPage());

  const publicPosts = renderedPosts.filter(({ post }) => !post.draft);
  await writeFile('feed.xml', rssFeed(publicPosts.slice(0, site.feedLength)));
  await writeFile(
    'sitemap.xml',
    sitemap(publicPosts.map(({ post }) => post), pages, tags.map((t) => t.slug)),
  );
  await writeFile('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`);
  await writeFile('CNAME', `${site.domain}\n`);
  await writeFile('.nojekyll', '');

  await copyDir(paths.static, paths.dist);
  await copyKatexAssets();

  const ms = Math.round(performance.now() - started);
  console.log(`Done: ${posts.length} posts, ${pages.length} pages, ${tags.length} tags in ${ms} ms -> ${path.relative(paths.root, paths.dist)}/`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? `\nBuild failed: ${err.message}` : err);
  process.exit(1);
});
