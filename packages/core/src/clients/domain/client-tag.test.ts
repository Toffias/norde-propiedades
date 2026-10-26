import { describe, expect, it } from 'vitest';

import { mergeTagIds } from './client-tag';

describe('mergeTagIds', () => {
  it('replaces the source with the target and keeps one when the contact had both', () => {
    expect(mergeTagIds(['a', 'source', 'b'], 'source', 'target')).toEqual(['a', 'target', 'b']);
    expect(mergeTagIds(['target', 'source'], 'source', 'target')).toEqual(['target']);
    expect(mergeTagIds(['a'], 'source', 'target')).toEqual(['a']);
  });
});
