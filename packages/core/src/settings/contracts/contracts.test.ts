import { describe, expect, it } from 'vitest';

import { NEWS_SCOPES } from '../domain/company-settings';
import { COMPANY_SETTINGS_SECTIONS } from '../domain/company-settings.events';
import { MAX_COMPANY_FILE_BYTES } from '../domain/company-file';
import { FOOTER_VARIABLES } from '../domain/description-footer-template';
import { ADDRESS_DISPLAYS } from '../domain/pdf-options';
import { REFERENCE_CODE_SCOPES } from '../domain/reference-code';
import { WATERMARK_POSITIONS } from '../domain/watermark';

import {
  ADDRESS_DISPLAY_VALUES,
  CreateReferenceCodeSequenceInputSchema,
  FOOTER_VARIABLE_VALUES,
  ListFolderContentsQuerySchema,
  MAX_COMPANY_FILE_UPLOAD_BYTES,
  NEWS_SCOPE_VALUES,
  REFERENCE_CODE_SCOPE_VALUES,
  UpdateGeneralSettingsInputSchema,
  WATERMARK_POSITION_VALUES,
} from '.';

describe('settings contracts', () => {
  it('mirror the domain enums and limits', () => {
    expect(NEWS_SCOPE_VALUES).toEqual(NEWS_SCOPES);
    expect(WATERMARK_POSITION_VALUES).toEqual(WATERMARK_POSITIONS);
    expect(ADDRESS_DISPLAY_VALUES).toEqual(ADDRESS_DISPLAYS);
    expect(FOOTER_VARIABLE_VALUES).toEqual(FOOTER_VARIABLES);
    expect(REFERENCE_CODE_SCOPE_VALUES).toEqual(REFERENCE_CODE_SCOPES);
    expect(MAX_COMPANY_FILE_UPLOAD_BYTES).toBe(MAX_COMPANY_FILE_BYTES);
    expect(COMPANY_SETTINGS_SECTIONS).toContain('general');
  });

  it('validates timezones with Intl', () => {
    const base = { name: 'Norde', newsScope: 'all' } as const;
    expect(
      UpdateGeneralSettingsInputSchema.safeParse({ ...base, timezone: 'America/Argentina/Salta' })
        .success,
    ).toBe(true);
    expect(
      UpdateGeneralSettingsInputSchema.safeParse({ ...base, timezone: 'Nowhere' }).success,
    ).toBe(false);
  });

  it('defaults the scope value to empty for the global sequence', () => {
    expect(CreateReferenceCodeSequenceInputSchema.parse({ scope: 'global', prefix: 'P' })).toEqual({
      scope: 'global',
      scopeValue: '',
      prefix: 'P',
    });
  });

  it('only sorts folder contents by whitelisted columns', () => {
    expect(ListFolderContentsQuerySchema.safeParse({ sort: '-size' }).success).toBe(true);
    expect(ListFolderContentsQuerySchema.safeParse({ sort: 'storageKey' }).success).toBe(false);
  });
});
