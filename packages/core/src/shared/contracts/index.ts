// Contracts del shared kernel (`@norde/core/shared/contracts`): importables desde el cliente.

export {
  DEFAULT_PAGE_SIZE,
  MAX_FILTER_VALUES,
  MAX_PAGE,
  MAX_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  bulkSelectionSchema,
  multiValueSchema,
  pageQuerySchema,
  sortSchema,
  type Sort,
  type SortDirection,
} from './pagination';
export { idempotencyKeySchema } from './idempotency';
