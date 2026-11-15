import { describe, expect, it } from 'vitest';

import { resolveChatSession, signChatSession, verifyChatSession } from './chat-session';

const SECRET = 'a-test-secret-with-more-than-32-characters';
const ID = '01890a5d-ac96-774b-bcce-b302099a8057';
const OTHER_ID = '01890a5d-ac96-774b-bcce-b302099a8058';

describe('verifyChatSession', () => {
  it('accepts a cookie we signed', () => {
    expect(verifyChatSession(signChatSession(ID, SECRET), SECRET)).toBe(ID);
  });

  it('rejects an unsigned UUID, the old format', () => {
    expect(verifyChatSession(ID, SECRET)).toBeUndefined();
  });

  it('rejects a signature for another session, another secret or a tampered one', () => {
    const signature = signChatSession(ID, SECRET).split('.')[1] ?? '';
    expect(verifyChatSession(`${OTHER_ID}.${signature}`, SECRET)).toBeUndefined();
    expect(verifyChatSession(signChatSession(ID, `${SECRET}-other`), SECRET)).toBeUndefined();
    expect(verifyChatSession(`${ID}.${signature.slice(0, -2)}`, SECRET)).toBeUndefined();
    expect(verifyChatSession(`${ID}.${signature}.extra`, SECRET)).toBeUndefined();
    expect(verifyChatSession(undefined, SECRET)).toBeUndefined();
  });

  it('rejects a signed value that is not a UUID', () => {
    expect(verifyChatSession(signChatSession('not-a-uuid', SECRET), SECRET)).toBeUndefined();
  });
});

describe('resolveChatSession', () => {
  function resolve(cookie: string | undefined, allowNew = true) {
    let asked = 0;
    const result = resolveChatSession({
      cookie,
      secret: SECRET,
      allowNew: () => {
        asked += 1;
        return allowNew;
      },
      newId: () => OTHER_ID,
    });
    return { result, asked };
  }

  it('keeps a valid session without counting a new one', () => {
    expect(resolve(signChatSession(ID, SECRET))).toEqual({
      result: { kind: 'existing', sessionId: ID },
      asked: 0,
    });
  });

  it('treats a forged UUID as a new session, subject to the limit', () => {
    expect(resolve(ID)).toEqual({
      result: { kind: 'created', sessionId: OTHER_ID, cookie: signChatSession(OTHER_ID, SECRET) },
      asked: 1,
    });
    expect(resolve(ID, false)).toEqual({ result: { kind: 'limited' }, asked: 1 });
  });

  it('creates a session when there is no cookie', () => {
    expect(resolve(undefined).result.kind).toBe('created');
  });
});
