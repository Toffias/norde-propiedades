import { parseId, type AuditState, type AuditTarget } from '../../shared';
import type { ClientTag, ClientTagGroup, ClientTagGroupId } from '../domain/client-tag';

import type { ClientsTransaction } from './ports/clients-transaction';

// Lo que comparten los commands del catálogo de etiquetas de contactos.

export interface ClientTagGroupNotFoundError {
  readonly type: 'TagGroupNotFound';
}
export interface ClientTagGroupNameTakenError {
  readonly type: 'TagGroupNameTaken';
}
export interface ClientTagGroupNotEmptyError {
  readonly type: 'TagGroupNotEmpty';
}
export interface ClientTagNotFoundError {
  readonly type: 'TagNotFound';
}
export interface ClientTagNameTakenError {
  readonly type: 'TagNameTaken';
}
/** Una etiqueta en uso no se borra: se quita de los contactos o se unifica con otra. */
export interface ClientTagInUseError {
  readonly type: 'TagInUse';
  readonly uses: number;
}

/** La configuración de etiquetas no tiene datos de clientes: `clientIds` vacío. */
export function tagCatalogTarget(
  entityType: string,
  action: string,
  entityId: string,
): AuditTarget {
  return { action, entityType, entityId, clientIds: [] };
}

export function clientTagGroupAuditState(group: ClientTagGroup): AuditState {
  const s = group.toSnapshot();
  return { name: s.name, position: s.position };
}

export function clientTagAuditState(tag: ClientTag): AuditState {
  const s = tag.toSnapshot();
  return { name: s.name, groupId: s.groupId };
}

/** Un ID ya validado como UUID por el contract. */
export function idOf<Brand extends string>(raw: string) {
  const id = parseId<Brand>(raw);
  return id.isOk() ? id.value : undefined;
}

export async function findTag(tx: ClientsTransaction, rawId: string) {
  const id = idOf<'ClientTag'>(rawId);
  return id === undefined ? undefined : tx.tags.findById(id);
}

export async function findTagGroup(tx: ClientsTransaction, rawId: string) {
  const id = idOf<'ClientTagGroup'>(rawId);
  return id === undefined ? undefined : tx.tagGroups.findById(id);
}

/** El grupo elegido, si existe. Sin grupo: `null`; un grupo que no existe: `undefined`. */
export async function resolveTagGroup(
  tx: ClientsTransaction,
  rawId: string | undefined,
): Promise<ClientTagGroupId | null | undefined> {
  if (rawId === undefined) return null;
  return (await findTagGroup(tx, rawId))?.id;
}
