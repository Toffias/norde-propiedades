import {
  boolean,
  index,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { authorship, linkAuthorship, notDeleted, searchText, timestamps, trash } from './columns';
import { coreSchema } from './core-schema';

/**
 * Usuarios del panel. Es el modelo de usuario de Better Auth (`usePlural`), con los campos
 * propios de Norde como `additionalFields` (decisión D5 de #19). IDs UUID v7 generados por la app.
 */
export const users = coreSchema.table(
  'users',
  {
    id: uuid('id').primaryKey(),
    /** En minúsculas. */
    email: text('email').notNull(),
    name: text('name').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    phoneE164: text('phone_e164'),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'restrict' }),
    /** `active` / `suspended`. */
    status: text('status').notNull().default('active'),
    /** `none` / `supervised` / `supervisor`. */
    supervisionMode: text('supervision_mode').notNull().default('none'),
    emailSenderName: text('email_sender_name'),
    emailSignature: text('email_signature'),
    timezone: text('timezone').notNull().default('America/Argentina/Buenos_Aires'),
    notificationsEnabled: boolean('notifications_enabled').notNull().default(true),
    /** Lo exige la importación de Tokko y el blanqueo de contraseña. */
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...timestamps(),
    /** Nullable: el primer usuario lo crea el setup, sin actor. */
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    /** Búsqueda del listado de usuarios por nombre o email. */
    searchText: searchText('name', 'email'),
  },
  (t) => [
    uniqueIndex('users_email_uq').on(t.email),
    // Un índice por cada orden del listado, que siempre filtra por estado.
    index('users_status_name_idx').on(t.status, t.name),
    index('users_status_email_idx').on(t.status, t.email),
    index('users_status_last_login_idx').on(t.status, t.lastLoginAt),
    index('users_status_created_idx').on(t.status, t.createdAt),
    index('users_search_text_idx').using('gin', t.searchText.op('gin_trgm_ops')),
    index('users_branch_idx').on(t.branchId),
  ],
);

/** Sesiones de Better Auth. */
export const sessions = coreSchema.table(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    ...timestamps(),
  },
  (t) => [uniqueIndex('sessions_token_uq').on(t.token), index('sessions_user_idx').on(t.userId)],
);

/** Cuentas de Better Auth: una por proveedor (`credential` guarda el hash de la contraseña). */
export const accounts = coreSchema.table(
  'accounts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    ...timestamps(),
  },
  (t) => [
    index('accounts_user_idx').on(t.userId),
    uniqueIndex('accounts_provider_account_uq').on(t.providerId, t.accountId),
  ],
);

/** Tokens de verificación de Better Auth (mail, blanqueo de contraseña). */
export const verifications = coreSchema.table(
  'verifications',
  {
    id: uuid('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
);

/**
 * Roles: grupos de permisos editables desde el panel (Administrador, Gerente, Agente…). Un
 * usuario puede tener varios (`user_roles`). Equivale a `AspNetRoles`.
 */
export const roles = coreSchema.table(
  'roles',
  {
    id: uuid('id').primaryKey(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** Los roles del sistema no se borran ni se renombran. */
    isSystem: boolean('is_system').notNull().default(false),
    ...timestamps(),
    ...authorship(),
    searchText: searchText('name'),
  },
  (t) => [
    uniqueIndex('roles_key_uq').on(t.key),
    index('roles_name_idx').on(t.name),
    index('roles_search_text_idx').using('gin', t.searchText.op('gin_trgm_ops')),
  ],
);

/** Permisos de cada rol (`AspNetRoleClaims`): `recurso:acción`; `recurso:*` otorga todas. */
export const rolePermissions = coreSchema.table(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permission: text('permission').notNull(),
    ...linkAuthorship(),
  },
  (t) => [
    primaryKey({ columns: [t.roleId, t.permission] }),
    // "Qué roles tienen este permiso".
    index('role_permissions_permission_idx').on(t.permission),
  ],
);

/** Roles de cada usuario (`AspNetUserRoles`). */
export const userRoles = coreSchema.table(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    ...linkAuthorship(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.roleId] }),
    // Usuarios de un rol, y no borrar un rol en uso.
    index('user_roles_role_idx').on(t.roleId),
  ],
);

/**
 * Permisos propios de un usuario (`AspNetUserClaims`), además de los de sus roles. `grant` suma
 * un permiso y `deny` lo quita aunque venga de un rol. La regla vive en el dominio (`identity`).
 */
export const userPermissions = coreSchema.table(
  'user_permissions',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    permission: text('permission').notNull(),
    /** `grant` / `deny`. */
    effect: text('effect').notNull(),
    ...linkAuthorship(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.permission] }),
    index('user_permissions_permission_idx').on(t.permission),
  ],
);

export const branches = coreSchema.table(
  'branches',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    logoUrl: text('logo_url'),
    address: text('address'),
    email: text('email'),
    phoneE164: text('phone_e164'),
    whatsappE164: text('whatsapp_e164'),
    isMain: boolean('is_main').notNull().default(false),
    ...timestamps(),
    ...authorship(),
    ...trash(),
  },
  (t) => [uniqueIndex('branches_name_uq').on(t.name).where(notDeleted)],
);

export const teams = coreSchema.table(
  'teams',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'restrict' }),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [index('teams_branch_idx').on(t.branchId)],
);

export const teamMembers = coreSchema.table(
  'team_members',
  {
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ...linkAuthorship(),
  },
  (t) => [
    primaryKey({ columns: [t.teamId, t.userId] }),
    index('team_members_user_idx').on(t.userId),
  ],
);

/** Favoritos de cada usuario: clientes, propiedades, emprendimientos o búsquedas. */
export const userFavorites = coreSchema.table(
  'user_favorites',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `client` / `property` / `development` / `saved_search`. */
    entityType: text('entity_type').notNull(),
    /** Entidad de otro módulo: solo el ID, sin foreign key entre módulos. */
    entityId: uuid('entity_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.entityType, t.entityId] }),
    index('user_favorites_user_created_idx').on(t.userId, t.createdAt),
    // Supresión de un cliente y limpieza al borrar una entidad.
    index('user_favorites_entity_idx').on(t.entityType, t.entityId),
  ],
);
