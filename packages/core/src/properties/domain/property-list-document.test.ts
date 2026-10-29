import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared';
import { unwrap, unwrapErr } from '../../shared/testing';

import { PropertyListDocument } from './property-list-document';
import { includesAgent, MAX_LIST_DOCUMENT_PROPERTIES, sheetHasMap } from './property-sheet';

const NOW = new Date('2026-10-29T12:00:00Z');
const ID = unwrap(parseId<'PropertyListDocument'>('00000000-0000-7000-8000-0000000000d1'));

function propertyId(n: number) {
  return unwrap(parseId<'Property'>(`00000000-0000-7000-8000-${n.toString().padStart(12, '0')}`));
}

function request(count: number, repeat = false) {
  const ids = Array.from({ length: count }, (_, i) => propertyId(i + 1));
  return PropertyListDocument.request({
    id: ID,
    propertyIds: repeat ? [...ids, ...ids] : ids,
    layout: 'landscape',
    includeAgent: false,
    requestedBy: 'u1',
    now: NOW,
  });
}

describe('PropertyListDocument', () => {
  it('keeps each property once, in order, and asks for the PDF', () => {
    const document = unwrap(request(2, true));
    expect(document.propertyIds).toEqual([propertyId(1), propertyId(2)]);
    expect(document.status).toBe('pending');
    expect(document.pullEvents()).toMatchObject([
      {
        type: 'properties.list_document_requested',
        payload: { documentId: ID, layout: 'landscape', count: 2 },
      },
    ]);
  });

  it('needs at least one property and at most a hundred', () => {
    expect(unwrapErr(request(0))).toEqual({ type: 'NothingToExport' });
    expect(unwrapErr(request(MAX_LIST_DOCUMENT_PROPERTIES + 1))).toEqual({
      type: 'TooManyToExport',
      max: MAX_LIST_DOCUMENT_PROPERTIES,
      total: MAX_LIST_DOCUMENT_PROPERTIES + 1,
    });
  });

  it('is downloadable only once it is ready', () => {
    const document = unwrap(request(1));
    expect(unwrapErr(document.readyFile())).toEqual({ type: 'DocumentNotReady' });
    document.complete('properties/exports/x', NOW);
    expect(unwrap(document.readyFile())).toBe('properties/exports/x');
    document.fail('x'.repeat(600), NOW);
    expect(document.toSnapshot().error).toHaveLength(500);
  });
});

describe('property sheet rules', () => {
  it('knows which layouts carry the map', () => {
    expect(sheetHasMap('landscape_map')).toBe(true);
    expect(sheetHasMap('portrait_map')).toBe(true);
    expect(sheetHasMap('grid')).toBe(false);
  });

  it('lets the user choose the agent details only when the settings ask', () => {
    expect(includesAgent('show', false)).toBe(true);
    expect(includesAgent('hide', true)).toBe(false);
    expect(includesAgent('ask', true)).toBe(true);
    expect(includesAgent('ask', undefined)).toBe(false);
  });
});
