// Catálogo de permisos que se pueden asignar a un rol o a un usuario. Agrupa los permisos
// globales relevados en Tokko (Contactos, Propiedades, Emprendimientos, Gerencia, Marketing,
// Configuración) más los de los módulos de Norde. Un permiso que no está acá no se puede asignar.

import type { PermissionClaim } from './access';

export interface UnknownPermissionError {
  readonly type: 'UnknownPermission';
  readonly permission: string;
}

export interface PermissionDefinition {
  readonly permission: PermissionClaim;
  readonly label: string;
}

export interface PermissionResource {
  /** Primera parte del permiso (`clients`); `clients:*` otorga todas sus acciones. */
  readonly resource: string;
  readonly label: string;
  readonly permissions: readonly PermissionDefinition[];
}

export interface PermissionGroup {
  readonly label: string;
  readonly resources: readonly PermissionResource[];
}

function crud(resource: string, nouns: string): readonly PermissionDefinition[] {
  return [
    { permission: `${resource}:read`, label: `Ver ${nouns}` },
    { permission: `${resource}:create`, label: `Crear ${nouns}` },
    { permission: `${resource}:update`, label: `Editar ${nouns}` },
    { permission: `${resource}:delete`, label: `Borrar ${nouns}` },
  ];
}

export const PERMISSION_CATALOG: readonly PermissionGroup[] = [
  {
    label: 'Contactos',
    resources: [
      {
        resource: 'clients',
        label: 'Contactos',
        permissions: [
          { permission: 'clients:read', label: 'Ver sus contactos' },
          { permission: 'clients:read-branch', label: 'Ver contactos de su sucursal' },
          { permission: 'clients:read-all', label: 'Ver contactos de otras sucursales' },
          { permission: 'clients:read-owners', label: 'Ver datos de propietarios' },
          { permission: 'clients:create', label: 'Crear contactos' },
          { permission: 'clients:update', label: 'Editar sus contactos' },
          { permission: 'clients:update-others', label: 'Editar contactos de otros' },
          { permission: 'clients:rename', label: 'Renombrar contactos' },
          { permission: 'clients:reassign', label: 'Cambiar el agente de un contacto' },
          { permission: 'clients:delete', label: 'Borrar sus contactos' },
          { permission: 'clients:delete-others', label: 'Borrar contactos de otros' },
          { permission: 'clients:export', label: 'Exportar contactos' },
          { permission: 'clients:merge', label: 'Unificar contactos' },
          { permission: 'clients:import', label: 'Importar contactos desde Excel' },
          { permission: 'clients:erase', label: 'Suprimir los datos de un contacto (Ley 25.326)' },
        ],
      },
      {
        resource: 'opportunities',
        label: 'Oportunidades',
        permissions: crud('opportunities', 'oportunidades'),
      },
      {
        resource: 'conversations',
        label: 'Conversaciones',
        permissions: [
          { permission: 'conversations:read', label: 'Ver conversaciones' },
          { permission: 'conversations:receive', label: 'Recibir conversaciones del agente IA' },
          { permission: 'conversations:reply', label: 'Responder conversaciones' },
        ],
      },
    ],
  },
  {
    label: 'Propiedades',
    resources: [
      {
        resource: 'properties',
        label: 'Propiedades',
        permissions: [
          { permission: 'properties:read', label: 'Ver propiedades' },
          { permission: 'properties:search', label: 'Buscar propiedades' },
          { permission: 'properties:create', label: 'Crear propiedades' },
          { permission: 'properties:update', label: 'Editar sus propiedades' },
          { permission: 'properties:update-branch', label: 'Editar propiedades de su sucursal' },
          { permission: 'properties:update-all', label: 'Editar propiedades de otras sucursales' },
          { permission: 'properties:change-producer', label: 'Cambiar el productor' },
          { permission: 'properties:change-owner', label: 'Cambiar el propietario' },
          { permission: 'properties:mark-available', label: 'Marcar como disponible' },
          { permission: 'properties:bulk-edit', label: 'Edición rápida masiva' },
          { permission: 'properties:publish', label: 'Publicar en la web' },
          { permission: 'properties:export', label: 'Exportar hasta 10 propiedades' },
          { permission: 'properties:export-bulk', label: 'Exportar más de 10 propiedades' },
          { permission: 'properties:delete', label: 'Borrar sus propiedades' },
          { permission: 'properties:delete-others', label: 'Borrar propiedades de otros' },
        ],
      },
      {
        resource: 'developments',
        label: 'Emprendimientos',
        permissions: [
          { permission: 'developments:read', label: 'Ver emprendimientos' },
          { permission: 'developments:create', label: 'Crear emprendimientos' },
          { permission: 'developments:update', label: 'Editar sus emprendimientos' },
          {
            permission: 'developments:update-branch',
            label: 'Editar emprendimientos de su sucursal',
          },
          { permission: 'developments:update-all', label: 'Editar todos los emprendimientos' },
          { permission: 'developments:delete', label: 'Borrar emprendimientos' },
        ],
      },
    ],
  },
  {
    label: 'Gerencia',
    resources: [
      {
        resource: 'followups',
        label: 'Seguimientos',
        permissions: [{ permission: 'followups:read-others', label: 'Ver seguimientos de otros' }],
      },
      {
        resource: 'audit',
        label: 'Historial',
        permissions: [
          { permission: 'audit:read', label: 'Ver el historial de lo suyo' },
          { permission: 'audit:read-others', label: 'Ver el historial de otros' },
        ],
      },
      {
        resource: 'appraisals',
        label: 'Tasaciones',
        permissions: [
          ...crud('appraisals', 'tasaciones'),
          { permission: 'appraisals:read-others', label: 'Ver tasaciones de otros' },
        ],
      },
      {
        resource: 'reservations',
        label: 'Reservas',
        permissions: crud('reservations', 'reservas'),
      },
      {
        resource: 'files',
        label: 'Archivos',
        permissions: [{ permission: 'files:update', label: 'Editar archivos' }],
      },
      {
        resource: 'quick-replies',
        label: 'Respuestas rápidas',
        permissions: [
          { permission: 'quick-replies:manage', label: 'Administrar respuestas rápidas' },
        ],
      },
      {
        resource: 'reports',
        label: 'Reportes',
        permissions: [{ permission: 'reports:read', label: 'Ver reportes' }],
      },
    ],
  },
  {
    label: 'Alquileres',
    resources: [
      { resource: 'rentals', label: 'Alquileres', permissions: crud('rentals', 'contratos') },
    ],
  },
  {
    label: 'Marketing',
    resources: [
      {
        resource: 'portals',
        label: 'Portales',
        permissions: [{ permission: 'portals:publish', label: 'Publicar en portales' }],
      },
      {
        resource: 'inquiries',
        label: 'Consultas',
        permissions: [
          { permission: 'inquiries:read', label: 'Ver consultas' },
          { permission: 'inquiries:update', label: 'Responder consultas' },
          { permission: 'inquiries:manage', label: 'Administrar consultas' },
        ],
      },
      {
        resource: 'tags',
        label: 'Etiquetas',
        permissions: [{ permission: 'tags:update', label: 'Editar etiquetas' }],
      },
      {
        resource: 'notifications',
        label: 'Notificaciones',
        permissions: [{ permission: 'notifications:read', label: 'Ver notificaciones' }],
      },
    ],
  },
  {
    label: 'Configuración',
    resources: [
      {
        resource: 'settings',
        label: 'Configuración',
        permissions: [
          { permission: 'settings:read', label: 'Ver la configuración de la empresa' },
          { permission: 'settings:update', label: 'Editar la configuración de la empresa' },
          { permission: 'settings:auto-followups', label: 'Configurar seguimientos automáticos' },
        ],
      },
      {
        resource: 'company-files',
        label: 'Archivos de la empresa',
        permissions: [
          { permission: 'company-files:read', label: 'Ver y descargar archivos' },
          { permission: 'company-files:upload', label: 'Subir archivos' },
          { permission: 'company-files:manage', label: 'Organizar, renombrar y borrar archivos' },
        ],
      },
    ],
  },
  {
    label: 'Empresa',
    resources: [
      {
        resource: 'users',
        label: 'Usuarios',
        permissions: [
          { permission: 'users:read', label: 'Ver usuarios' },
          { permission: 'users:create', label: 'Crear usuarios' },
          { permission: 'users:update', label: 'Editar usuarios y sus roles' },
          { permission: 'users:suspend', label: 'Suspender y reactivar usuarios' },
          { permission: 'users:reset-password', label: 'Blanquear contraseñas' },
          { permission: 'users:permissions', label: 'Dar o quitar permisos propios a un usuario' },
        ],
      },
      { resource: 'roles', label: 'Roles', permissions: crud('roles', 'roles') },
      { resource: 'branches', label: 'Sucursales', permissions: crud('branches', 'sucursales') },
      { resource: 'teams', label: 'Equipos', permissions: crud('teams', 'equipos') },
    ],
  },
];

const RESOURCES = new Set(
  PERMISSION_CATALOG.flatMap((group) => group.resources.map((r) => r.resource)),
);
const PERMISSIONS = new Set<string>(
  PERMISSION_CATALOG.flatMap((group) =>
    group.resources.flatMap((r) => r.permissions.map((p) => p.permission)),
  ),
);

/** Está en el catálogo, o es `recurso:*` de un recurso del catálogo. */
export function isKnownPermission(permission: string): permission is PermissionClaim {
  const separator = permission.indexOf(':');
  if (separator === -1) return false;
  if (permission.slice(separator + 1) === '*') {
    return RESOURCES.has(permission.slice(0, separator));
  }
  return PERMISSIONS.has(permission);
}
