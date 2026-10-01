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

  it('knows where it acts from, for the audit log', () => {
    expect(Actor.user('user-1', []).source).toBe('gestion');
    expect(Actor.system('agent-ia', []).source).toBe('agent');
    expect(Actor.system('portal-sync', []).source).toBe('scheduler');
    expect(Actor.system('import', []).source).toBe('import');
  });

  it('keeps identity and permissions when bound to a correlation id', () => {
    const user = Actor.user('user-1', ['clients:read']);
    const bound = user.withCorrelation('request-1');

    expect(user.correlationId).toBeUndefined();
    expect(bound.correlationId).toBe('request-1');
    expect(bound.id).toBe('user-1');
    expect(bound.can('clients:read')).toBe(true);
  });
});
