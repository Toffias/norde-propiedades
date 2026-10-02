import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared';

import {
  checkImportRows,
  ClientImport,
  MAX_IMPORT_ROWS,
  suggestImportMapping,
  validateImportMapping,
} from './client-import';

const now = new Date('2026-10-02T12:00:00Z');

function aJob(rows = 3) {
  const id = parseId<'ClientImport'>('00000000-0000-7000-8000-000000000001');
  if (id.isErr()) throw new Error('Invalid test id');
  const job = ClientImport.request({
    id: id.value,
    fileName: 'contactos.xlsx',
    storageKey: 'imports/clients/1',
    mapping: { name: 0, mobile: 1 },
    columnCount: 2,
    rows,
    agentId: 'a1',
    branchId: 'b1',
    requestedBy: 'u1',
    now,
  });
  if (job.isErr()) throw new Error('Invalid test job');
  return job.value;
}

describe('validateImportMapping', () => {
  it('needs a name (or company) and a phone or email', () => {
    expect(validateImportMapping({ name: 0, email: 1 }, 2).isOk()).toBe(true);
    expect(validateImportMapping({ companyName: 0, phone: 1 }, 2).isOk()).toBe(true);
    expect(validateImportMapping({ email: 1 }, 2).isErr() && 'missing_name').toBe('missing_name');

    const missingContact = validateImportMapping({ name: 0, jobTitle: 1 }, 2);
    expect(missingContact.isErr() && missingContact.error).toEqual({
      type: 'InvalidImportMapping',
      reason: 'missing_contact',
    });
  });

  it('rejects columns that do not exist or are used twice', () => {
    const unknown = validateImportMapping({ name: 0, email: 5 }, 2);
    expect(unknown.isErr() && unknown.error.reason).toBe('unknown_column');
    const repeated = validateImportMapping({ name: 0, email: 0 }, 2);
    expect(repeated.isErr() && repeated.error.reason).toBe('repeated_column');
  });
});

describe('checkImportRows', () => {
  it('needs at least one row and at most the limit', () => {
    expect(checkImportRows(1).isOk()).toBe(true);
    expect(checkImportRows(MAX_IMPORT_ROWS).isOk()).toBe(true);
    const empty = checkImportRows(0);
    expect(empty.isErr() && empty.error).toEqual({ type: 'EmptyImportFile' });
    const many = checkImportRows(MAX_IMPORT_ROWS + 1);
    expect(many.isErr() && many.error).toEqual({ type: 'TooManyImportRows', max: MAX_IMPORT_ROWS });
  });
});

describe('suggestImportMapping', () => {
  it('recognizes the exported headers and the usual ones, without accents or case', () => {
    expect(
      suggestImportMapping([
        'Nombre',
        'Tipo de registro',
        'Empresa',
        'Teléfono',
        'Celular',
        'Email',
        'Tipos de cliente',
        'Agente',
      ]),
    ).toEqual({
      name: 0,
      kind: 1,
      companyName: 2,
      phone: 3,
      mobile: 4,
      email: 5,
      clientTypes: 6,
    });
    expect(suggestImportMapping(['  E-MAIL ', 'WhatsApp', 'DNI', 'Fecha de nacimiento'])).toEqual({
      email: 0,
      mobile: 1,
      documentNumber: 2,
      birthDate: 3,
    });
  });

  it('uses each column once', () => {
    expect(suggestImportMapping(['Mail', 'Mail'])).toEqual({ email: 0 });
  });
});

describe('ClientImport', () => {
  it('is requested pending and announces it to the job', () => {
    const job = aJob();

    expect(job.status).toBe('pending');
    expect(job.totals).toEqual({ rows: 3, processed: 0, created: 0, duplicates: 0, failed: 0 });
    expect(job.pullEvents()).toEqual([
      {
        type: 'clients.import_requested',
        aggregateId: job.id,
        occurredAt: now,
        payload: { importId: job.id },
      },
    ]);
  });

  it('cannot be requested with a bad mapping or an empty file', () => {
    const id = parseId<'ClientImport'>('00000000-0000-7000-8000-000000000001');
    if (id.isErr()) throw new Error('Invalid test id');
    const base = {
      id: id.value,
      fileName: 'x.xlsx',
      storageKey: 'k',
      columnCount: 2,
      agentId: undefined,
      branchId: undefined,
      requestedBy: 'u1',
      now,
    };

    const empty = ClientImport.request({ ...base, mapping: { name: 0, email: 1 }, rows: 0 });
    expect(empty.isErr() && empty.error.type).toBe('EmptyImportFile');
    const unmapped = ClientImport.request({ ...base, mapping: { name: 0 }, rows: 1 });
    expect(unmapped.isErr() && unmapped.error.type).toBe('InvalidImportMapping');
  });

  it('counts every row and finishes with the totals', () => {
    const job = aJob();
    expect(job.start(now).isOk()).toBe(true);
    expect(job.status).toBe('running');

    job.recordRow('created', now);
    job.recordRow('duplicate', now);
    job.recordRow('failed', now);
    job.finish(now);

    expect(job.status).toBe('done');
    expect(job.totals).toEqual({ rows: 3, processed: 3, created: 1, duplicates: 1, failed: 1 });
    expect(job.toSnapshot().finishedAt).toEqual(now);
  });

  it('resumes a running import from the last processed row', () => {
    const job = aJob();
    job.start(now);
    job.recordRow('created', now);

    const resumed = ClientImport.restore(job.toSnapshot());
    expect(resumed.start(now).isOk()).toBe(true);
    expect(resumed.wasProcessed(0)).toBe(true);
    expect(resumed.wasProcessed(1)).toBe(false);
  });

  it('does not start again once finished', () => {
    const job = aJob();
    job.start(now);
    job.fail('unreadable_file', now);

    expect(job.status).toBe('failed');
    expect(job.toSnapshot().failure).toBe('unreadable_file');
    const again = job.start(now);
    expect(again.isErr() && again.error).toEqual({ type: 'ImportFinished' });
  });
});
