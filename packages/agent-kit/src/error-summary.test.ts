import { describe, expect, it } from 'vitest';

import { errorSummary } from './error-summary';

describe('errorSummary', () => {
  it('keeps only the name and the first line, without the query params', () => {
    const error = new TypeError(
      'Failed query: select * from clients where phone = $1\nparams: +5491166899124',
    );

    expect(errorSummary(error)).toEqual({
      name: 'TypeError',
      message: 'Failed query: select * from clients where phone = $1',
    });
  });

  it('cuts a long message', () => {
    const summary = errorSummary(new Error('x'.repeat(1000)));

    expect(summary.message.length).toBeLessThanOrEqual(301);
  });

  it('logs nothing of a thrown value that is not an Error', () => {
    expect(errorSummary({ phone: '+5491166899124' })).toEqual({ name: 'object', message: '' });
  });
});
