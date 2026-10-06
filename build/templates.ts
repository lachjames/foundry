import { site } from '../site.config.ts';
import type { Page, Post } from './content.ts';
import type { Rendered, TocEntry } from './markdown.ts';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const longDate = new Intl.DateTimeFormat(site.language, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatDate(d: Date): string {
  return longDate.format(d);
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function absoluteUrl(pathname: string): string {
  return new URL(pathname, `${site.url}/`).toString();
}

export function readingTime(wordCount: number): string {
  const minutes = Math.max(1, Math.round(wordCount / 230));
  return `${minutes} min read`;
}

export function tagUrl(tagSlug: string): string {
  return `/tags/${tagSlug}/`;
}

interface LayoutOptions {
  title: string;
  description: string;
  /** Site-relative path of the page, with trailing slash. */
  path: string;
  type?: 'website' | 'article';
  image?: string | null;
  usesMath?: boolean;
  jsonLd?: Record<string, unknown> | null;
  bodyClass?: string;
  body: string;
}

export function layout(o: LayoutOptions): string {
  const fullTitle = o.path === '/' ? `${site.title} — ${site.tagline}` : `${o.title} · ${site.title}`;
  const canonical = absoluteUrl(o.path);
  const image = o.image ? absoluteUrl(o.image) : null;
  const repoLink = site.repo ? ` · <a href="${escapeHtml(site.repo)}" rel="noopener">Source</a>` : '';

  return `<!doctype html>
<html lang="${escapeHtml(site.language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(o.description)}">
  <meta name="author" content="${escapeHtml(site.author.name)}">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" media="(prefers-color-scheme: light)" content="#fdfdfc">
  <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#121214">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="alternate" type="application/rss+xml" title="${escapeHtml(site.title)}" href="/feed.xml">
  <link rel="stylesheet" href="/assets/style.css">
${o.usesMath ? '  <link rel="stylesheet" href="/assets/katex/katex.min.css">\n' : ''}  <meta property="og:site_name" content="${escapeHtml(site.title)}">
  <meta property="og:type" content="${o.type ?? 'website'}">
  <meta property="og:title" content="${escapeHtml(o.title)}">
  <meta property="og:description" content="${escapeHtml(o.description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
${image ? `  <meta property="og:image" content="${escapeHtml(image)}">\n` : ''}  <meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
${o.jsonLd ? `  <script type="application/ld+json">${JSON.stringify(o.jsonLd)}</script>\n` : ''}</head>
<body${o.bodyClass ? ` class="${o.bodyClass}"` : ''}>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <a class="site-name" href="/"><span class="site-mark" aria-hidden="true"></span>${escapeHtml(site.title)}</a>
    <nav class="site-nav" aria-label="Site">
      <a href="/">Posts</a>
      <a href="/tags/">Tags</a>
      <a href="/about/">About</a>
      <a href="/feed.xml" title="RSS feed">RSS</a>
    </nav>
  </header>
  <main id="main">
${o.body}
  </main>
  <footer class="site-footer">
    <p>&copy; ${new Date().getUTCFullYear()} <a href="${escapeHtml(site.author.url)}" rel="noopener">${escapeHtml(site.author.name)}</a>${repoLink} · <a href="/feed.xml">RSS</a></p>
  </footer>
</body>
</html>
`;
}

function tagList(post: Post, tagSlugs: Map<string, string>): string {
  if (post.tags.length === 0) return '';
  const items = post.tags
    .map((t) => `<a class="tag" href="${tagUrl(tagSlugs.get(t) ?? t)}">${escapeHtml(t)}</a>`)
    .join('');
  return `<span class="tags">${items}</span>`;
}

function draftBadge(post: Post): string {
  return post.draft ? '<span class="badge badge-draft">Draft</span>' : '';
}

function tocHtml(toc: TocEntry[]): string {
  if (toc.length < 3) return '';
  const items = toc
    .map((e) => `<li class="toc-l${e.level}"><a href="#${escapeHtml(e.id)}">${escapeHtml(e.text)}</a></li>`)
    .join('\n');
  return `<nav class="toc" aria-label="Contents"><details open><summary>Contents</summary><ol>\n${items}\n</ol></details></nav>`;
}

export function postPage(post: Post, rendered: Rendered, tagSlugs: Map<string, string>): string {
  const image = post.image ? (post.image.startsWith('/') || /^https?:/.test(post.image) ? post.image : post.url + post.image) : null;
  const updated = post.updated
    ? `<span class="meta-updated">Updated <time datetime="${isoDate(post.updated)}">${formatDate(post.updated)}</time></span>`
    : '';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.summary,
    datePublished: isoDate(post.date),
    ...(post.updated ? { dateModified: isoDate(post.updated) } : {}),
    author: { '@type': 'Person', name: site.author.name, url: site.author.url },
    url: absoluteUrl(post.url),
    ...(image ? { image: absoluteUrl(image) } : {}),
    keywords: post.tags.join(', '),
  };

  const body = `<article class="post">
  <header class="post-header">
    <h1>${escapeHtml(post.title)}${draftBadge(post)}</h1>
    <p class="post-meta">
      <time datetime="${isoDate(post.date)}">${formatDate(post.date)}</time>
      <span class="meta-sep" aria-hidden="true">·</span>
      <span>${readingTime(rendered.wordCount)}</span>
      ${updated ? `<span class="meta-sep" aria-hidden="true">·</span>${updated}` : ''}
    </p>
    <p class="post-summary">${escapeHtml(post.summary)}</p>
    ${tagList(post, tagSlugs)}
  </header>
  ${tocHtml(rendered.toc)}
  <div class="prose">
${rendered.html}
  </div>
  <footer class="post-footer">
    <a href="/">&larr; All posts</a>
  </footer>
</article>`;

  return layout({
    title: post.title,
    description: post.summary,
    path: post.url,
    type: 'article',
    image,
    usesMath: rendered.usesMath,
    jsonLd,
    bodyClass: 'page-post',
    body,
  });
}

function postListItem(post: Post, tagSlugs: Map<string, string>): string {
  return `<li class="post-item">
  <a class="post-item-title" href="${post.url}">${escapeHtml(post.title)}</a>${draftBadge(post)}
  <p class="post-item-summary">${escapeHtml(post.summary)}</p>
  <p class="post-item-meta"><time datetime="${isoDate(post.date)}">${formatDate(post.date)}</time>${tagList(post, tagSlugs)}</p>
</li>`;
}

export function postList(posts: Post[], tagSlugs: Map<string, string>): string {
  if (posts.length === 0) return '<p class="empty">Nothing here yet.</p>';
  const byYear = new Map<number, Post[]>();
  for (const p of posts) {
    const y = p.date.getUTCFullYear();
    byYear.set(y, [...(byYear.get(y) ?? []), p]);
  }
  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(
      ([year, list]) => `<section class="year-group">
  <h2 class="year">${year}</h2>
  <ul class="post-list">
${list.map((p) => postListItem(p, tagSlugs)).join('\n')}
  </ul>
</section>`,
    )
    .join('\n');
}

export function indexPage(posts: Post[], tagSlugs: Map<string, string>): string {
  const body = `<section class="intro">
  <h1>${escapeHtml(site.tagline)}</h1>
  <p>${escapeHtml(site.description)}</p>
</section>
${postList(posts, tagSlugs)}`;

  return layout({
    title: site.title,
    description: site.description,
    path: '/',
    bodyClass: 'page-index',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: site.title,
      description: site.description,
      url: site.url,
      author: { '@type': 'Person', name: site.author.name, url: site.author.url },
    },
    body,
  });
}

export function tagsIndexPage(tags: { tag: string; slug: string; posts: Post[] }[]): string {
  const items = tags
    .map(
      (t) =>
        `<li><a class="tag tag-large" href="${tagUrl(t.slug)}">${escapeHtml(t.tag)}</a> <span class="tag-count">${t.posts.length}</span></li>`,
    )
    .join('\n');
  const body = `<section class="intro"><h1>Tags</h1></section>
<ul class="tag-cloud">
${items || '<li class="empty">No tags yet.</li>'}
</ul>`;
  return layout({ title: 'Tags', description: `Topics covered on ${site.title}.`, path: '/tags/', body });
}

export function tagPage(tag: { tag: string; slug: string; posts: Post[] }, tagSlugs: Map<string, string>): string {
  const body = `<section class="intro">
  <h1>Tagged “${escapeHtml(tag.tag)}”</h1>
  <p>${tag.posts.length} ${tag.posts.length === 1 ? 'post' : 'posts'} · <a href="/tags/">All tags</a></p>
</section>
${postList(tag.posts, tagSlugs)}`;
  return layout({
    title: `Tagged “${tag.tag}”`,
    description: `Posts on ${site.title} tagged ${tag.tag}.`,
    path: tagUrl(tag.slug),
    body,
  });
}

export function standalonePage(page: Page, rendered: Rendered): string {
  const body = `<article class="post page">
  <header class="post-header"><h1>${escapeHtml(page.title)}</h1></header>
  <div class="prose">
${rendered.html}
  </div>
</article>`;
  return layout({
    title: page.title,
    description: page.description ?? site.description,
    path: page.url,
    usesMath: rendered.usesMath,
    body,
  });
}

export function notFoundPage(): string {
  const body = `<section class="intro">
  <h1>404</h1>
  <p>That page isn’t here. It may have moved, or the link may be wrong.</p>
  <p><a href="/">&larr; Back to all posts</a></p>
</section>`;
  return layout({ title: 'Not found', description: 'Page not found.', path: '/404.html', body });
}
