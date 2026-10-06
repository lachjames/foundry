import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

const ROOT = path.resolve(import.meta.dirname, '..');

export const paths = {
  root: ROOT,
  content: path.join(ROOT, 'content'),
  posts: path.join(ROOT, 'content', 'posts'),
  pages: path.join(ROOT, 'content', 'pages'),
  static: path.join(ROOT, 'static'),
  dist: path.join(ROOT, 'dist'),
  nodeModules: path.join(ROOT, 'node_modules'),
} as const;

export interface Post {
  /** URL slug, e.g. `hello-foundry`. Derived from the folder name minus any `YYYY-MM-DD-` prefix. */
  slug: string;
  /** Site-relative URL with trailing slash, e.g. `/posts/hello-foundry/`. */
  url: string;
  title: string;
  date: Date;
  updated: Date | null;
  summary: string;
  tags: string[];
  draft: boolean;
  /** Optional social-card image, relative to the post folder or absolute. */
  image: string | null;
  markdown: string;
  sourceDir: string;
  sourceFile: string;
}

export interface Page {
  slug: string;
  url: string;
  title: string;
  description: string | null;
  markdown: string;
  sourceFile: string;
}

export interface LoadOptions {
  includeDrafts: boolean;
}

class ContentError extends Error {
  constructor(file: string, message: string) {
    super(`${path.relative(ROOT, file)}: ${message}`);
    this.name = 'ContentError';
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function asDate(value: unknown, file: string, field: string): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  throw new ContentError(file, `front matter field "${field}" must be a date (got ${JSON.stringify(value)})`);
}

function asString(value: unknown, file: string, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ContentError(file, `front matter field "${field}" is required and must be a non-empty string`);
  }
  return value.trim();
}

function asTags(value: unknown, file: string): string[] {
  if (value == null) return [];
  if (typeof value === 'string') return value.split(',').map((t) => t.trim()).filter(Boolean);
  if (Array.isArray(value) && value.every((t) => typeof t === 'string')) {
    return (value as string[]).map((t) => t.trim()).filter(Boolean);
  }
  throw new ContentError(file, 'front matter field "tags" must be a list of strings');
}

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `2026-10-06-hello-foundry` -> `hello-foundry`; anything else passes through slugified. */
export function slugFromFolder(folder: string): string {
  return slugify(folder.replace(/^\d{4}-\d{2}-\d{2}-/, ''));
}

export async function loadPosts(options: LoadOptions): Promise<Post[]> {
  if (!(await exists(paths.posts))) return [];
  const entries = await fs.readdir(paths.posts, { withFileTypes: true });
  const posts: Post[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
    const sourceDir = path.join(paths.posts, entry.name);
    const sourceFile = path.join(sourceDir, 'index.md');
    if (!(await exists(sourceFile))) {
      console.warn(`  skipping ${entry.name}: no index.md`);
      continue;
    }

    const raw = await fs.readFile(sourceFile, 'utf8');
    const { data, content } = matter(raw);

    const draft = data.draft === true;
    if (draft && !options.includeDrafts) continue;

    const slug = typeof data.slug === 'string' ? slugify(data.slug) : slugFromFolder(entry.name);
    if (!slug) throw new ContentError(sourceFile, 'could not derive a slug');

    posts.push({
      slug,
      url: `/posts/${slug}/`,
      title: asString(data.title, sourceFile, 'title'),
      date: asDate(data.date, sourceFile, 'date'),
      updated: data.updated == null ? null : asDate(data.updated, sourceFile, 'updated'),
      summary: asString(data.summary, sourceFile, 'summary'),
      tags: asTags(data.tags, sourceFile),
      draft,
      image: typeof data.image === 'string' ? data.image : null,
      markdown: content,
      sourceDir,
      sourceFile,
    });
  }

  const seen = new Map<string, string>();
  for (const post of posts) {
    const other = seen.get(post.slug);
    if (other) throw new ContentError(post.sourceFile, `slug "${post.slug}" collides with ${path.relative(ROOT, other)}`);
    seen.set(post.slug, post.sourceFile);
  }

  posts.sort((a, b) => b.date.getTime() - a.date.getTime() || a.title.localeCompare(b.title));
  return posts;
}

export async function loadPages(): Promise<Page[]> {
  if (!(await exists(paths.pages))) return [];
  const entries = await fs.readdir(paths.pages, { withFileTypes: true });
  const pages: Page[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name.startsWith('_')) continue;
    const sourceFile = path.join(paths.pages, entry.name);
    const raw = await fs.readFile(sourceFile, 'utf8');
    const { data, content } = matter(raw);
    const slug = slugify(typeof data.slug === 'string' ? data.slug : entry.name.replace(/\.md$/, ''));
    pages.push({
      slug,
      url: `/${slug}/`,
      title: asString(data.title, sourceFile, 'title'),
      description: typeof data.description === 'string' ? data.description : null,
      markdown: content,
      sourceFile,
    });
  }

  pages.sort((a, b) => a.title.localeCompare(b.title));
  return pages;
}

/** Unique tags across posts, with counts, most-used first. */
export function collectTags(posts: Post[]): { tag: string; slug: string; posts: Post[] }[] {
  const map = new Map<string, Post[]>();
  for (const post of posts) {
    for (const tag of post.tags) {
      const list = map.get(tag) ?? [];
      list.push(post);
      map.set(tag, list);
    }
  }
  return [...map.entries()]
    .map(([tag, list]) => ({ tag, slug: slugify(tag), posts: list }))
    .sort((a, b) => b.posts.length - a.posts.length || a.tag.localeCompare(b.tag));
}
