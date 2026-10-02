import {
  CLIENT_IMPORT_STATUS_LABELS,
  type ClientImportStatusValue,
} from '@norde/core/clients/contracts';
import { StatusPill, type StatusTone } from '@norde/ui/components/status-pill';

const STATUS_TONES: Readonly<Record<ClientImportStatusValue, StatusTone>> = {
  pending: 'amber',
  running: 'amber',
  done: 'green',
  failed: 'red',
};

export function isImportRunning(status: ClientImportStatusValue): boolean {
  return status === 'pending' || status === 'running';
}

export function ImportStatusPill({ status }: { readonly status: ClientImportStatusValue }) {
  return <StatusPill tone={STATUS_TONES[status]}>{CLIENT_IMPORT_STATUS_LABELS[status]}</StatusPill>;
}
