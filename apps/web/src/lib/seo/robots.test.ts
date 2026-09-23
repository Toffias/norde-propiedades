import { describe, expect, it } from 'vitest';

import { buildRobots } from './robots';

describe('buildRobots', () => {
  const robots = buildRobots('https://norde.com.ar');
  const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];

  it('blocks the admin, the API and the preview for every crawler', () => {
    for (const rule of rules) {
      expect(rule.disallow).toEqual(expect.arrayContaining(['/admin/', '/api/', '/next/']));
    }
  });

  it('explicitly allows the AI crawlers', () => {
    const aiRule = rules.find((r) => Array.isArray(r.userAgent));
    expect(aiRule?.userAgent).toEqual(
      expect.arrayContaining(['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']),
    );
    expect(aiRule?.allow).toBe('/');
  });

  it('points to the sitemap', () => {
    expect(robots.sitemap).toBe('https://norde.com.ar/sitemap.xml');
  });
});
