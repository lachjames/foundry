/**
 * Site-wide configuration. Everything that is "about the site" rather than
 * "about a post" lives here.
 */
export const site = {
  title: 'Foundry',
  tagline: 'Engineering and research write-ups',
  description:
    'Foundry is where Lachlan O\'Neill writes up engineering and research projects: what was built, why, and what was learned along the way.',

  /** Canonical origin, no trailing slash. Overridable for local dev. */
  url: process.env.SITE_URL ?? 'https://foundry.sodalabs.io',

  /** Written to dist/CNAME so GitHub Pages serves the custom domain. */
  domain: 'foundry.sodalabs.io',

  language: 'en-AU',

  author: {
    name: 'Lachlan O\'Neill',
    url: 'https://github.com/lachjames',
  },

  /** Source repository, shown in the footer when set. */
  repo: 'https://github.com/lachjames/foundry' as string | null,

  /** How many posts the RSS feed carries. */
  feedLength: 20,
} as const;

export type SiteConfig = typeof site;
