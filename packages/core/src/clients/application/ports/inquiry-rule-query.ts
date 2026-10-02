import type { PageSlice } from '../../../shared';
import type { InquiryRuleSnapshot } from '../../domain/inquiry-assignment-rule';

export interface InquiryRuleCriteria {
  readonly active: boolean;
  readonly offset: number;
  readonly limit: number;
}

/** Una regla con su lugar en la prioridad de su pestaña (1 = la primera). */
export interface InquiryRuleItem {
  readonly rule: InquiryRuleSnapshot;
  readonly priority: number;
}

/** Las reglas de una pestaña (activas o inactivas), por prioridad. */
export interface InquiryRuleQuery {
  search(criteria: InquiryRuleCriteria): Promise<PageSlice<InquiryRuleItem>>;
}
