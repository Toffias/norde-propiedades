import { describe, expect, it } from 'vitest';

import {
  EMPTY_SELECTION,
  canSelectAllMatching,
  fromRowSelectionState,
  selectionCount,
  toRowSelectionState,
} from './data-table-selection';

const PAGE = ['a', 'b', 'c'];

describe('selectionCount', () => {
  it('counts the marked ids', () => {
    expect(selectionCount({ kind: 'ids', ids: ['a', 'b'] }, 40)).toBe(2);
  });

  it('counts every matching row when the filter is selected', () => {
    expect(selectionCount({ kind: 'filter' }, 40)).toBe(40);
  });
});

describe('toRowSelectionState', () => {
  it('marks the selected ids', () => {
    expect(toRowSelectionState({ kind: 'ids', ids: ['b'] }, PAGE)).toEqual({ b: true });
  });

  it('marks the whole page when the filter is selected', () => {
    expect(toRowSelectionState({ kind: 'filter' }, PAGE)).toEqual({ a: true, b: true, c: true });
  });
});

describe('fromRowSelectionState', () => {
  it('turns the marked rows into an id selection', () => {
    expect(fromRowSelectionState({ a: true, c: true })).toEqual({
      kind: 'ids',
      ids: ['a', 'c'],
    });
  });
});

describe('canSelectAllMatching', () => {
  it('is offered when the full page is marked and more rows match', () => {
    expect(canSelectAllMatching({ kind: 'ids', ids: PAGE }, PAGE, 40)).toBe(true);
  });

  it('is not offered with a partial page, a single page or the filter already selected', () => {
    expect(canSelectAllMatching({ kind: 'ids', ids: ['a'] }, PAGE, 40)).toBe(false);
    expect(canSelectAllMatching({ kind: 'ids', ids: PAGE }, PAGE, 3)).toBe(false);
    expect(canSelectAllMatching({ kind: 'filter' }, PAGE, 40)).toBe(false);
    expect(canSelectAllMatching(EMPTY_SELECTION, [], 0)).toBe(false);
  });
});
