import { describe, expect, it } from 'vitest';

import { UpdateDevelopmentGeneralInputSchema } from './developments';

const base = {
  developmentId: '00000000-0000-7000-8000-0000000000e1',
  name: 'Torre Prueba',
  developmentType: 'building',
};

describe('UpdateDevelopmentGeneralInputSchema', () => {
  it('accepts an http or https website', () => {
    for (const websiteUrl of ['https://torre.example.test', 'http://torre.example.test/x']) {
      expect(UpdateDevelopmentGeneralInputSchema.safeParse({ ...base, websiteUrl }).success).toBe(
        true,
      );
    }
  });

  it('refuses links that run code or embed content', () => {
    for (const websiteUrl of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'ftp://x.test']) {
      expect(UpdateDevelopmentGeneralInputSchema.safeParse({ ...base, websiteUrl }).success).toBe(
        false,
      );
    }
  });
});
