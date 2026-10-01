import type { PageSlice } from '../../../shared';
import type { ReferenceCodeScope } from '../../domain/reference-code';

export interface ReferenceCodeSequenceRecord {
  readonly id: string;
  readonly scope: ReferenceCodeScope;
  readonly scopeValue: string;
  readonly prefix: string;
  readonly nextNumber: bigint;
}

export interface ReferenceCodeSequenceQuery {
  list(params: {
    readonly offset: number;
    readonly limit: number;
    readonly sort: { readonly field: 'scope' | 'prefix'; readonly direction: 'asc' | 'desc' };
  }): Promise<PageSlice<ReferenceCodeSequenceRecord>>;
}
