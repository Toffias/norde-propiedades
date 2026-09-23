import { describe, expect, it } from 'vitest';

import { absoluteUrl, routes, toSitePath } from './routes';

describe('absoluteUrl', () => {
  it('joins the site URL and the path without duplicated slashes', () => {
    expect(absoluteUrl('https://norde.com.ar/', '/blog')).toBe('https://norde.com.ar/blog');
    expect(absoluteUrl('https://norde.com.ar', 'blog')).toBe('https://norde.com.ar/blog');
  });

  it('keeps a trailing slash for the home', () => {
    expect(absoluteUrl('https://norde.com.ar', '/')).toBe('https://norde.com.ar/');
  });

  it('leaves URLs that are already absolute untouched', () => {
    expect(absoluteUrl('https://norde.com.ar', 'https://norde.com.ar/api/media/file/a.webp')).toBe(
      'https://norde.com.ar/api/media/file/a.webp',
    );
  });
});

describe('toSitePath', () => {
  it('turns URLs of the site into relative paths', () => {
    expect(
      toSitePath('http://localhost:3000/api/media/file/a.png?v=2', 'http://localhost:3000'),
    ).toBe('/api/media/file/a.png?v=2');
    expect(toSitePath('/api/media/file/a.png', 'http://localhost:3000')).toBe(
      '/api/media/file/a.png',
    );
  });

  it('keeps URLs of other hosts', () => {
    expect(toSitePath('https://cdn.norde.com.ar/a.png', 'https://norde.com.ar')).toBe(
      'https://cdn.norde.com.ar/a.png',
    );
  });
});

describe('routes', () => {
  it('serves the first listing page from the base route', () => {
    expect(routes.blogPage(1)).toBe('/blog');
    expect(routes.blogPage(3)).toBe('/blog/pagina/3');
    expect(routes.categoryPage('barrios', 1)).toBe('/blog/categoria/barrios');
    expect(routes.categoryPage('barrios', 2)).toBe('/blog/categoria/barrios/pagina/2');
  });

  it('builds post URLs under /blog', () => {
    expect(routes.post('como-se-calcula-el-ipc')).toBe('/blog/como-se-calcula-el-ipc');
  });
});
