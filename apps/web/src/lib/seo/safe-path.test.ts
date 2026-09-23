import { describe, expect, it } from 'vitest';

import { isSafeRelativePath } from './safe-path';

describe('isSafeRelativePath', () => {
  it('accepts paths of the site', () => {
    expect(isSafeRelativePath('/')).toBe(true);
    expect(isSafeRelativePath('/blog/como-se-calcula-el-ipc')).toBe(true);
    expect(isSafeRelativePath('/blog?x=1')).toBe(true);
  });

  it('rejects paths that lead to another host', () => {
    for (const path of [
      '//evil.com',
      '/\\evil.com',
      'https://evil.com',
      'javascript:alert(1)',
      'blog',
      '/a b',
    ]) {
      expect(isSafeRelativePath(path)).toBe(false);
    }
  });
});
