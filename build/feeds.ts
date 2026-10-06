import { site } from '../site.config.ts';
import type { Page, Post } from './content.ts';
import { absoluteUrl, isoDate, tagUrl } from './templates.ts';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Posts use relative asset paths (`figure.svg`, `./demo/`). Feed readers have no
 * base URL, so rewrite anything relative to the post's absolute URL.
 */
export function absolutiseHtml(html: string, baseUrl: string): string {
  return html.replace(/\b(src|href|poster)="([^"]*)"/g, (match, attr: string, value: string) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#|data:)/i.test(value)) return match;
    return `${attr}="${new URL(value, baseUrl).toString()}"`;
  });
}

export function rssFeed(posts: { post: Post; html: string }[]): string {
  const latest = posts[0]?.post.date ?? new Date();
  const items = posts
    .map(({ post, html }) => {
      const url = absoluteUrl(post.url);
      const categories = post.tags.map((t) => `      <category>${escapeXml(t)}</category>`).join('\n');
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${post.date.toUTCString()}</pubDate>
      <description>${escapeXml(post.summary)}</description>
${categories ? categories + '\n' : ''}      <content:encoded><![CDATA[${absolutiseHtml(html, url).replace(/\]\]>/g, ']]]]><![CDATA[>')}]]></content:encoded>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(site.title)}</title>
    <link>${escapeXml(site.url)}/</link>
    <description>${escapeXml(site.description)}</description>
    <language>${escapeXml(site.language.toLowerCase())}</language>
    <lastBuildDate>${latest.toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(absoluteUrl('/feed.xml'))}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;
}

export function sitemap(posts: Post[], pages: Page[], tagSlugs: string[]): string {
  const entries: { loc: string; lastmod?: string }[] = [
    { loc: '/', lastmod: posts[0] ? isoDate(posts[0].updated ?? posts[0].date) : undefined },
    { loc: '/tags/' },
    ...pages.map((p) => ({ loc: p.url })),
    ...posts.map((p) => ({ loc: p.url, lastmod: isoDate(p.updated ?? p.date) })),
    ...tagSlugs.map((s) => ({ loc: tagUrl(s) })),
  ];
  const urls = entries
    .map(
      (e) =>
        `  <url><loc>${escapeXml(absoluteUrl(e.loc))}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}
