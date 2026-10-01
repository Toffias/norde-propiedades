import { parseId, type AuditState, type AuditTarget } from '../../shared';
import type { Feature } from '../domain/feature';
import type { Location } from '../domain/location';
import type { PropertyTag, TagGroup } from '../domain/property-tag';

// Lo que comparten los commands de los catálogos: errores, auditoría y búsqueda por ID.

export interface LocationNotFoundError {
  readonly type: 'LocationNotFound';
}
export interface LocationNameTakenError {
  readonly type: 'LocationNameTaken';
}
export interface FeatureNotFoundError {
  readonly type: 'FeatureNotFound';
}
export interface FeatureNameTakenError {
  readonly type: 'FeatureNameTaken';
}
export interface TagGroupNotFoundError {
  readonly type: 'TagGroupNotFound';
}
export interface TagGroupNameTakenError {
  readonly type: 'TagGroupNameTaken';
}
export interface TagGroupNotEmptyError {
  readonly type: 'TagGroupNotEmpty';
}
export interface TagNotFoundError {
  readonly type: 'TagNotFound';
}
export interface TagNameTakenError {
  readonly type: 'TagNameTaken';
}
export interface TagInUseError {
  readonly type: 'TagInUse';
  readonly uses: number;
}
export interface FavoriteSearchNotFoundError {
  readonly type: 'FavoriteSearchNotFound';
}

export function catalogTarget(entityType: string, action: string, entityId: string): AuditTarget {
  return { action, entityType, entityId, clientIds: [] };
}

export function locationAuditState(location: Location): AuditState {
  const s = location.toSnapshot();
  return { name: s.name, kind: s.kind, parentId: s.parentId };
}

export function featureAuditState(feature: Feature): AuditState {
  const s = feature.toSnapshot();
  return { kind: s.kind, key: s.key, name: s.name, position: s.position, isActive: s.isActive };
}

export function tagGroupAuditState(group: TagGroup): AuditState {
  const s = group.toSnapshot();
  return { name: s.name, position: s.position };
}

export function tagAuditState(tag: PropertyTag): AuditState {
  const s = tag.toSnapshot();
  return { name: s.name, groupId: s.groupId };
}

/** Un ID de la URL o del formulario, ya validado como UUID por el contract. */
export function idOf<Brand extends string>(raw: string) {
  const id = parseId<Brand>(raw);
  return id.isOk() ? id.value : undefined;
}
