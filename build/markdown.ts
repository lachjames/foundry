import MarkdownIt from 'markdown-it';
import type { Options as MarkdownItOptions, Token } from 'markdown-it';
import anchor from 'markdown-it-anchor';
import footnoteModule from 'markdown-it-footnote';
import katexModule from '@vscode/markdown-it-katex';
import { bundledLanguages, createHighlighter, type BundledLanguage, type Highlighter } from 'shiki';
import { slugify } from './content.ts';

/** Some plugins ship as CommonJS with `exports.default`; unwrap either shape. */
function interop<T>(mod: T): T {
  const m = mod as unknown as { default?: T } | null;
  return m && typeof m === 'object' && 'default' in m && m.default ? m.default : mod;
}
const footnote = interop(footnoteModule);
/** The package's .d.ts describes a module namespace rather than the plugin function it actually exports. */
const katex = interop(katexModule) as unknown as (md: MarkdownIt, options?: Record<string, unknown>) => void;

type RenderRule = NonNullable<MarkdownIt['renderer']['rules'][string]>;

export interface TocEntry {
  level: 2 | 3;
  id: string;
  text: string;
}

export interface Rendered {
  html: string;
  toc: TocEntry[];
  wordCount: number;
  /** True when the document contains KaTeX output, so the page can include the stylesheet. */
  usesMath: boolean;
}

export interface MarkdownRenderer {
  render(markdown: string): Promise<Rendered>;
}

const SHIKI_THEMES = { light: 'github-light', dark: 'github-dark' } as const;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveLanguage(raw: string): BundledLanguage | 'text' {
  const lang = raw.trim().toLowerCase();
  if (!lang || lang === 'text' || lang === 'txt' || lang === 'plain' || lang === 'plaintext') return 'text';
  return lang in bundledLanguages ? (lang as BundledLanguage) : 'text';
}

/**
 * Turns a paragraph that contains nothing but one image into a <figure> with
 * the alt text as <figcaption>. Standard `![caption](src)` syntax, no extension.
 */
function figureRule(md: MarkdownIt): void {
  md.core.ruler.push('figures', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i + 2 < tokens.length; i++) {
      const open = tokens[i]!;
      const inline = tokens[i + 1]!;
      const close = tokens[i + 2]!;
      if (open.type !== 'paragraph_open' || inline.type !== 'inline' || close.type !== 'paragraph_close') continue;
      const children = (inline.children ?? []).filter(
        (c) => c.type !== 'softbreak' && !(c.type === 'text' && c.content.trim() === ''),
      );
      if (children.length !== 1 || children[0]!.type !== 'image') continue;
      open.tag = 'figure';
      close.tag = 'figure';
      children[0]!.meta = { ...(children[0]!.meta ?? {}), figure: true };
    }
  });

  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!;
    const children = token.children ?? [];
    const alt = self.renderInlineAsText(children, options, env);
    token.attrSet('alt', alt);
    if (!token.attrGet('loading')) token.attrSet('loading', 'lazy');
    if (!token.attrGet('decoding')) token.attrSet('decoding', 'async');
    const img = `<img${self.renderAttrs(token)}>`;
    if (token.meta?.figure && alt) {
      return `${img}<figcaption>${self.renderInline(children, options, env)}</figcaption>`;
    }
    return img;
  };
}

/**
 * Fenced code via shiki. Info string: `lang [label]`, e.g. ```ts build/build.ts
 * Unknown languages fall back to plain text rather than failing the build.
 */
function fenceRule(md: MarkdownIt, highlighter: Highlighter): void {
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx]!;
    const info = token.info.trim();
    const [rawLang = '', ...rest] = info.split(/\s+/);
    const label = rest.join(' ');
    const lang = resolveLanguage(rawLang);
    const code = token.content.replace(/\n$/, '');
    const html = highlighter.codeToHtml(code, { lang, themes: SHIKI_THEMES, defaultColor: false });
    const attrs = [`class="codeblock"`];
    if (rawLang) attrs.push(`data-lang="${escapeHtml(rawLang)}"`);
    const labelHtml = label ? `<div class="codeblock-label">${escapeHtml(label)}</div>` : '';
    return `<div ${attrs.join(' ')}>${labelHtml}${html}</div>\n`;
  };
}

function countWords(tokens: Token[]): number {
  let words = 0;
  const visit = (list: Token[]) => {
    for (const t of list) {
      if (t.type === 'text' || t.type === 'code_inline') {
        words += t.content.split(/\s+/).filter(Boolean).length;
      } else if (t.children) {
        visit(t.children);
      }
    }
  };
  visit(tokens);
  return words;
}

export async function createRenderer(): Promise<MarkdownRenderer> {
  const highlighter = await createHighlighter({ themes: Object.values(SHIKI_THEMES), langs: [] });
  const loadedLanguages = new Set<string>();

  let tocSink: TocEntry[] = [];

  const md: MarkdownIt = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
  });

  md.use(anchor, {
    level: [2, 3, 4],
    slugify,
    permalink: anchor.permalink.linkInsideHeader({
      symbol: '#',
      placement: 'after',
      class: 'heading-anchor',
      ariaHidden: true,
    }),
    callback: (token, info) => {
      const level = Number(token.tag.slice(1));
      if (level === 2 || level === 3) tocSink.push({ level, id: info.slug, text: info.title });
    },
  });
  md.use(footnote);
  md.use(katex, { throwOnError: false });
  figureRule(md);
  fenceRule(md, highlighter);

  // Open external links in the same tab but mark them as such; keeps the reading flow honest.
  const defaultLinkOpen: RenderRule =
    md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const href = tokens[idx]!.attrGet('href') ?? '';
    if (/^https?:\/\//i.test(href)) tokens[idx]!.attrSet('rel', 'noopener');
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  async function ensureLanguages(tokens: Token[]): Promise<void> {
    const wanted = new Set<BundledLanguage>();
    for (const t of tokens) {
      if (t.type !== 'fence') continue;
      const lang = resolveLanguage(t.info.trim().split(/\s+/)[0] ?? '');
      if (lang !== 'text' && !loadedLanguages.has(lang)) wanted.add(lang);
    }
    if (wanted.size === 0) return;
    await highlighter.loadLanguage(...wanted);
    for (const lang of wanted) loadedLanguages.add(lang);
  }

  return {
    async render(markdown: string): Promise<Rendered> {
      tocSink = [];
      const env: Record<string, unknown> = {};
      const tokens = md.parse(markdown, env);
      await ensureLanguages(tokens);
      const html = md.renderer.render(tokens, md.options as MarkdownItOptions, env);
      return {
        html,
        toc: tocSink,
        wordCount: countWords(tokens),
        usesMath: html.includes('class="katex'),
      };
    },
  };
}
