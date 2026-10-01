import { describe, expect, it } from 'vitest';

import { Actor } from './actor';
import { auditAction, auditCreated, auditUpdated, diffChanges, toAuditValue } from './audit';

const camila = Actor.user('user-camila', []);
const target = {
  action: 'property.updated',
  entityType: 'property',
  entityId: 'property-1',
  clientIds: ['client-1'],
};

describe('diffChanges', () => {
  it('keeps only the fields that changed, with before and after', () => {
    const changes = diffChanges(
      { address: 'Av. Santa Fe 1234', rooms: 3, title: 'Depto' },
      { address: 'Av. Santa Fe 1243', rooms: 3, title: 'Depto' },
    );

    expect(changes).toEqual({
      address: { before: 'Av. Santa Fe 1234', after: 'Av. Santa Fe 1243' },
    });
  });

  it('compares money, dates, arrays and nested objects by value', () => {
    const before = {
      price: { cents: 12_000_000n, currency: 'USD' },
      listedAt: new Date('2026-03-01T10:00:00Z'),
      tags: ['a', 'b'],
    };
    const same = {
      price: { cents: 12_000_000n, currency: 'USD' },
      listedAt: new Date('2026-03-01T10:00:00Z'),
      tags: ['a', 'b'],
    };

    expect(diffChanges(before, same)).toEqual({});
    expect(
      diffChanges(before, { ...same, price: { cents: 11_500_000n, currency: 'USD' } }),
    ).toEqual({
      price: {
        before: { cents: 12_000_000n, currency: 'USD' },
        after: { cents: 11_500_000n, currency: 'USD' },
      },
    });
    expect(diffChanges(before, { ...same, tags: ['a'] })).toEqual({
      tags: { before: ['a', 'b'], after: ['a'] },
    });
  });

  it('treats a missing field as null', () => {
    expect(diffChanges({ email: undefined }, { email: null })).toEqual({});
    expect(diffChanges({}, { email: 'ana@example.com' })).toEqual({
      email: { before: null, after: 'ana@example.com' },
    });
  });
});

describe('toAuditValue', () => {
  it('drops undefined fields and keeps raw values', () => {
    expect(
      toAuditValue({
        location: 'Palermo',
        maxPriceCents: 80_000_000n,
        minRooms: undefined,
        tags: ['a'],
      }),
    ).toEqual({ location: 'Palermo', maxPriceCents: 80_000_000n, tags: ['a'] });
    expect(toAuditValue(undefined)).toBeNull();
  });
});

describe('audit entries', () => {
  it('records the initial values of a creation, skipping empty fields', () => {
    const entry = auditCreated(camila, target, { title: 'Depto', floor: undefined, rooms: 3 });

    expect(entry).toEqual({
      ...target,
      actorId: 'user-camila',
      source: 'gestion',
      kind: 'created',
      changes: { title: { before: null, after: 'Depto' }, rooms: { before: null, after: 3 } },
    });
  });

  it('records only what changed in an edition, and nothing when nothing changed', () => {
    const entry = auditUpdated(camila, target, { price: 12_000_000n }, { price: 11_500_000n });

    expect(entry?.kind).toBe('updated');
    expect(entry?.changes).toEqual({ price: { before: 12_000_000n, after: 11_500_000n } });
    expect(auditUpdated(camila, target, { price: 1n }, { price: 1n })).toBeUndefined();
  });

  it('records explicit actions with an optional diff', () => {
    expect(auditAction(camila, { ...target, action: 'property.deleted' })).not.toHaveProperty(
      'changes',
    );
    expect(
      auditAction(camila, target, { status: { before: 'available', after: 'reserved' } }).changes,
    ).toEqual({ status: { before: 'available', after: 'reserved' } });
  });

  it('takes the source and correlation from the actor', () => {
    const agent = Actor.system('agent-ia', []).withCorrelation('msg-42');
    const entry = auditAction(agent, target);

    expect(entry.actorId).toBe('system:agent-ia');
    expect(entry.source).toBe('agent');
    expect(entry.correlationId).toBe('msg-42');
    expect(auditAction(camila, target)).not.toHaveProperty('correlationId');
  });
});
