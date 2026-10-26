import type { NotificationRow } from '@norde/core/notifications/contracts';
import { describe, expect, it } from 'vitest';

import { badgeCount, notificationHref, notificationText } from './notifications';

const CLIENT_ID = '00000000-0000-7000-8000-0000000000c1';
const row: NotificationRow = {
  id: '00000000-0000-7000-8000-000000000001',
  type: 'client.assigned',
  entityId: CLIENT_ID,
  client: { id: CLIENT_ID, name: 'Ana Pérez' },
  read: false,
  createdAt: new Date('2026-03-01T10:00:00Z'),
};

describe('notificationText', () => {
  it('says what was assigned, with the current name of the contact', () => {
    expect(notificationText(row)).toBe('Te asignaron el contacto Ana Pérez');
    expect(notificationText({ ...row, type: 'opportunity.assigned' })).toBe(
      'Te asignaron una oportunidad de Ana Pérez',
    );
    expect(notificationText({ ...row, type: 'inquiry.assigned' })).toBe(
      'Te asignaron una consulta de Ana Pérez',
    );
  });

  it('covers a contact without a name and one that no longer exists', () => {
    const unnamed = { id: CLIENT_ID, name: undefined };
    expect(notificationText({ ...row, client: unnamed })).toBe(
      'Te asignaron un contacto sin nombre',
    );
    expect(notificationText({ ...row, client: undefined })).toBe(
      'Te asignaron un contacto que ya no existe',
    );
    expect(notificationText({ ...row, type: 'opportunity.assigned', client: unnamed })).toBe(
      'Te asignaron una oportunidad de un contacto sin nombre',
    );
    expect(notificationText({ ...row, type: 'inquiry.assigned', client: undefined })).toBe(
      'Te asignaron una consulta de un contacto que ya no existe',
    );
  });
});

describe('notificationHref', () => {
  it('opens the contact, on its opportunities tab for opportunities and inquiries', () => {
    expect(notificationHref(row)).toBe(`/contactos/${CLIENT_ID}`);
    expect(notificationHref({ ...row, type: 'opportunity.assigned' })).toBe(
      `/contactos/${CLIENT_ID}?tab=oportunidades`,
    );
    expect(notificationHref({ ...row, type: 'inquiry.assigned' })).toBe(
      `/contactos/${CLIENT_ID}?tab=oportunidades`,
    );
    expect(notificationHref({ ...row, client: undefined })).toBeUndefined();
  });
});

describe('badgeCount', () => {
  it('caps the badge at 99+', () => {
    expect(badgeCount(7)).toBe('7');
    expect(badgeCount(100)).toBe('99+');
  });
});
