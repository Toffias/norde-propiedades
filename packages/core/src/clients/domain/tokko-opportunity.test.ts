import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared';

import { Opportunity } from './opportunity';
import {
  tokkoCloseReason,
  tokkoOpportunityState,
  tokkoOpportunityType,
  tokkoOrigin,
} from './tokko-opportunity';

describe('tokkoOpportunityState', () => {
  it('opens "Pendiente contactar" as new, "Tomar Accion" as contacted, and closes "Cerrado"', () => {
    expect(tokkoOpportunityState('Pendiente contactar')).toEqual({
      closed: false,
      category: 'new',
    });
    expect(tokkoOpportunityState('Tomar Acción')).toEqual({ closed: false, category: 'contacted' });
    expect(tokkoOpportunityState(' CERRADO ')).toEqual({ closed: true });
    expect(tokkoOpportunityState('Archivado')).toBeUndefined();
  });
});

describe('tokkoCloseReason', () => {
  it('translates the Tokko reasons to the ones of Norde, with the note in parentheses', () => {
    expect(tokkoCloseReason('Alquilo con nosotros ()')).toEqual({
      target: { name: 'Compró o alquiló con Norde', rating: 'positive' },
      note: undefined,
      type: 'rent',
    });
    expect(tokkoCloseReason('Compro con otro (se fue con la competencia)')).toEqual({
      target: { name: 'Compró o alquiló con otra inmobiliaria', rating: 'negative' },
      note: 'se fue con la competencia',
      type: 'sale',
    });
    expect(tokkoCloseReason('Fantasma ()').target.name).toBe('No respondió');
    expect(tokkoCloseReason('Sin seguimiento (-)').target.name).toBe('Dejó de buscar');
    expect(tokkoCloseReason('Es Propietario - Tasación exitosa ()')).toMatchObject({
      target: { name: 'Tasación exitosa', rating: 'positive' },
      type: 'appraisal',
    });
  });

  it('closes the rest as "Otro", keeping an unknown reason and dropping filler notes', () => {
    const other = { name: 'Otro', rating: 'negative' };
    expect(tokkoCloseReason('other (.\n)')).toEqual({
      target: other,
      note: undefined,
      type: undefined,
    });
    expect(tokkoCloseReason('()')).toMatchObject({ target: other, note: undefined });
    expect(tokkoCloseReason('-')).toMatchObject({ target: other, note: undefined });
    expect(tokkoCloseReason(undefined)).toMatchObject({ target: other, note: undefined });
    expect(tokkoCloseReason('Otro (ñ)')).toMatchObject({ target: other, note: undefined });
    expect(tokkoCloseReason('Vendió el auto (quiere esperar )')).toEqual({
      target: other,
      note: 'Motivo en Tokko: Vendió el auto. quiere esperar',
      type: undefined,
    });
  });
});

describe('tokkoOrigin', () => {
  it('takes the first origin, with one channel per portal', () => {
    expect(tokkoOrigin('ZonaProp | mercadolibre')).toBe('zonaprop');
    expect(tokkoOrigin('mercadolibre')).toBe('mercadolibre');
    expect(tokkoOrigin('icasas | enbuenosaires')).toBe('icasas');
    expect(tokkoOrigin('Reporte Inmobiliario')).toBe('reporte_inmobiliario');
    expect(tokkoOrigin('OLX')).toBe('olx');
    expect(tokkoOrigin('Sitio Web | properati')).toBe('web_form');
  });

  it('is the office without an origin or with an unknown one', () => {
    expect(tokkoOrigin(undefined)).toBe('office');
    expect(tokkoOrigin('')).toBe('office');
    expect(tokkoOrigin('Cartel en la vidriera')).toBe('office');
  });
});

describe('tokkoOpportunityType', () => {
  it('uses the reason first, then the tags, and is a sale by default', () => {
    expect(tokkoOpportunityType(tokkoCloseReason('Alquilo con otro ()'), ['Venta'])).toBe('rent');
    expect(tokkoOpportunityType(undefined, ['Web', 'Tasacion'])).toBe('appraisal');
    expect(tokkoOpportunityType(undefined, ['Alquiler', 'PH'])).toBe('rent');
    expect(tokkoOpportunityType(tokkoCloseReason('Fantasma ()'), ['Alquiler', 'Venta'])).toBe(
      'sale',
    );
    expect(tokkoOpportunityType(undefined, [])).toBe('sale');
  });
});

describe('Opportunity.imported', () => {
  const id = <T extends string>(n: number) => {
    const parsed = parseId<T>(`00000000-0000-7000-8000-${String(n).padStart(12, '0')}`);
    if (parsed.isErr()) throw new Error('Invalid test id');
    return parsed.value;
  };
  const created = new Date('2024-02-01T03:00:00Z');
  const closed = new Date('2024-03-10T03:00:00Z');
  const base = {
    id: id<'Opportunity'>(1),
    clientId: id<'Client'>(2),
    originChannel: 'zonaprop' as const,
    type: 'sale' as const,
    agent: { agentId: 'a1', branchId: 'b1' },
    statusChangeId: id<'OpportunityStatusChange'>(3),
    note: 'Quedó en avisar',
    createdAt: created,
    statusChangedAt: closed,
  };
  const lost = { id: id<'OpportunityStage'>(4), category: 'lost' as const, isActive: true };
  const negative = {
    id: id<'OpportunityCloseReason'>(5),
    rating: 'negative' as const,
    isActive: true,
  };

  it('arrives closed with its reason and the dates of the other system, announcing the import', () => {
    const result = Opportunity.imported({ ...base, stage: lost, closeReason: negative });
    if (result.isErr()) throw new Error(result.error.reason);
    const opportunity = result.value;

    expect(opportunity.toSnapshot()).toMatchObject({
      status: 'lost',
      stageId: lost.id,
      closeReasonId: negative.id,
      intent: 'contact',
      createdAt: created,
      statusChangedAt: closed,
      closedAt: closed,
      notes: [{ text: 'Quedó en avisar', createdAt: created }],
    });
    expect(opportunity.pullStatusChanges()).toEqual([
      expect.objectContaining({ fromStatus: undefined, toStatus: 'lost', changedAt: closed }),
    ]);
    // No es una consulta nueva: no dispara los avisos ni las reglas de "oportunidad creada".
    expect(opportunity.pullEvents().map((e) => e.type)).toEqual(['clients.opportunity_imported']);
  });

  it('arrives open without a reason, and never changes state before it was created', () => {
    const contacted = {
      id: id<'OpportunityStage'>(6),
      category: 'contacted' as const,
      isActive: true,
    };
    const result = Opportunity.imported({
      ...base,
      stage: contacted,
      closeReason: undefined,
      statusChangedAt: new Date('2020-01-01T00:00:00Z'),
    });

    expect(result.isOk() && result.value.toSnapshot()).toMatchObject({
      status: 'contacted',
      closedAt: undefined,
      statusChangedAt: created,
    });
  });

  it('rejects a closed one without a reason, an open one with a reason, or a mismatched one', () => {
    const reason = (r: ReturnType<typeof Opportunity.imported>) => r.isErr() && r.error.reason;
    const open = { id: id<'OpportunityStage'>(7), category: 'new' as const, isActive: true };
    const positive = { ...negative, rating: 'positive' as const };

    expect(reason(Opportunity.imported({ ...base, stage: lost, closeReason: undefined }))).toBe(
      'missing_close_reason',
    );
    expect(reason(Opportunity.imported({ ...base, stage: open, closeReason: negative }))).toBe(
      'unexpected_close_reason',
    );
    expect(reason(Opportunity.imported({ ...base, stage: lost, closeReason: positive }))).toBe(
      'close_stage_mismatch',
    );
  });
});
