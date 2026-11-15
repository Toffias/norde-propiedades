import { describe, expect, it } from 'vitest';

import { countBySource, inquirySourceOf } from './inquiry-source';

describe('inquirySourceOf', () => {
  it('keeps the two portals, the web AI agent and the WhatsApp bot apart', () => {
    expect(inquirySourceOf('mercadolibre')).toBe('mercadolibre');
    expect(inquirySourceOf('zonaprop')).toBe('zonaprop');
    expect(inquirySourceOf('web_chat')).toBe('web_chat');
    expect(inquirySourceOf('whatsapp')).toBe('whatsapp');
  });

  it('groups every other channel as other', () => {
    expect(inquirySourceOf('web_form')).toBe('other');
    expect(inquirySourceOf('argenprop')).toBe('other');
    expect(inquirySourceOf('phone_call')).toBe('other');
    expect(inquirySourceOf('icasas')).toBe('other');
  });
});

describe('countBySource', () => {
  it('adds the channel totals into their source and fills the missing ones with zero', () => {
    expect(
      countBySource(
        new Map([
          ['zonaprop', 4],
          ['web_form', 2],
          ['argenprop', 1],
          ['whatsapp', 3],
        ]),
      ),
    ).toEqual({ mercadolibre: 0, zonaprop: 4, web_chat: 0, whatsapp: 3, other: 3 });
  });
});
