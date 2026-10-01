import type { AuditState, AuditTarget } from '../../shared';
import type { ReferenceCodeSequence } from '../domain/reference-code-sequence';

/** Lo que se audita de una numeración. El correlativo no: avanza con cada alta. */
export function sequenceAuditState(sequence: ReferenceCodeSequence): AuditState {
  return {
    scope: sequence.scope,
    scopeValue: sequence.scopeValue === '' ? undefined : sequence.scopeValue,
    prefix: sequence.prefix.value,
  };
}

export function sequenceTarget(sequence: ReferenceCodeSequence, action: string): AuditTarget {
  return {
    action,
    entityType: 'reference_code_sequence',
    entityId: sequence.id,
    clientIds: [],
  };
}
