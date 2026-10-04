import type { DomainEvent } from '../../shared/domain/domain-event';

import type { AppraisalStatus } from './appraisal-status';

interface AppraisalPayload {
  readonly appraisalId: string;
  readonly requesterClientId: string;
}

export type AppraisalRequested = DomainEvent<'appraisals.appraisal_requested', AppraisalPayload>;
export type AppraisalUpdated = DomainEvent<'appraisals.appraisal_updated', AppraisalPayload>;
export type AppraisalStatusChanged = DomainEvent<
  'appraisals.appraisal_status_changed',
  AppraisalPayload & { readonly from: AppraisalStatus; readonly to: AppraisalStatus }
>;
export type AppraisalDeleted = DomainEvent<'appraisals.appraisal_deleted', AppraisalPayload>;
export type AppraisalRestored = DomainEvent<'appraisals.appraisal_restored', AppraisalPayload>;

export type AppraisalEvent =
  | AppraisalRequested
  | AppraisalUpdated
  | AppraisalStatusChanged
  | AppraisalDeleted
  | AppraisalRestored;
