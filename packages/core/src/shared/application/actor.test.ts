import { describe, expect, it } from 'vitest';

import { Actor } from './actor';

describe('Actor', () => {
  it('grants only the permissions it was given', () => {
    const agent = Actor.user('user-1', ['clients:read', 'clients:update']);

    expect(agent.can('clients:read')).toBe(true);
    expect(agent.can('clients:export')).toBe(false);
    expect(agent.can('properties:read')).toBe(false);
  });

  it('treats resource:* as every action on that resource', () => {
    const admin = Actor.user('user-2', ['properties:*']);

    expect(admin.can('properties:publish')).toBe(true);
    expect(admin.can('clients:read')).toBe(false);
  });

  it('identifies system actors by name', () => {
    const bot = Actor.system('agent-ia', ['properties:search']);

    expect(bot.id).toBe('system:agent-ia');
    expect(bot.kind).toBe('system');
    expect(bot.can('properties:search')).toBe(true);
  });
});
