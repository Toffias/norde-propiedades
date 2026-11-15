import { describe, expect, it } from 'vitest';

import { buildRobots } from './robots';

describe('buildRobots', () => {
  const robots = buildRobots('https://norde.com.ar', true);
  const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];

  it('blocks the admin, the API and the preview for every crawler', () => {
    for (const rule of rules) {
      expect(rule.disallow).toEqual(
        expect.arrayContaining(['/admin/', '/api/', '/next/', '/e/', '/suscripcion/']),
      );
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

describe('buildRobots outside production', () => {
  it('disallows everything and does not advertise the sitemap', () => {
    const robots = buildRobots('https://uat.norde.com.ar', false);

    expect(robots).toEqual({ rules: [{ userAgent: '*', disallow: '/' }] });
  });
});
