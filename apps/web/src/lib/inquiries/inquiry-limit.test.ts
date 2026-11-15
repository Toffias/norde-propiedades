import { describe, expect, it } from 'vitest';

import {
  createInquiryLimiter,
  INQUIRIES_PER_DAY,
  INQUIRIES_PER_WINDOW,
  INQUIRY_SUBMISSIONS_PER_WINDOW,
} from './inquiry-limit';

const TEN_MINUTES = 10 * 60_000;

describe('createInquiryLimiter', () => {
  it('caps the submissions per window', () => {
    const allow = createInquiryLimiter(() => 0);
    const results = Array.from({ length: INQUIRY_SUBMISSIONS_PER_WINDOW + 1 }, () =>
      allow('ip', 1),
    );
    expect(results.at(-1)).toBe(false);
    expect(results.slice(0, -1).every(Boolean)).toBe(true);
  });

  it('counts a favorites submission once per inquiry', () => {
    const allow = createInquiryLimiter(() => 0);
    expect(allow('ip', INQUIRIES_PER_WINDOW)).toBe(true);
    expect(allow('ip', 1)).toBe(false);
  });

  it('caps the inquiries per day across windows', () => {
    let now = 0;
    const allow = createInquiryLimiter(() => now);
    const perWindow = INQUIRIES_PER_WINDOW;
    for (let sent = 0; sent < INQUIRIES_PER_DAY; sent += perWindow) {
      expect(allow('ip', perWindow)).toBe(true);
      now += TEN_MINUTES;
    }
    expect(allow('ip', 1)).toBe(false);
    expect(allow('other', 1)).toBe(true);
  });
});
