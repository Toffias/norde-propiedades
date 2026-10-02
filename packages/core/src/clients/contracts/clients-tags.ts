// Etiquetas de contactos (#8): grupos, etiquetas, asignación y unificación.

import { z } from 'zod';

import { pageQuerySchema } from '../../shared/contracts';

/** Tope de etiquetas por contacto (replica `MAX_CLIENT_TAGS` del dominio). */
export const MAX_TAGS_PER_CLIENT = 50;

/** `none`: las etiquetas sin grupo. */
export const NO_CLIENT_TAG_GROUP = 'none';

const Name = z.string().trim().min(1, 'Escribí un nombre.').max(60);

export const ListClientTagGroupsQuerySchema = pageQuerySchema({
  sortable: ['position', 'name'],
  defaultSort: { field: 'position', direction: 'asc' },
}).extend({
  q: z.string().trim().min(1).max(60).optional(),
});
export type ListClientTagGroupsQuery = z.input<typeof ListClientTagGroupsQuerySchema>;

export const SearchClientTagsQuerySchema = pageQuerySchema({
  sortable: ['name'],
  defaultSort: { field: 'name', direction: 'asc' },
}).extend({
  q: z.string().trim().min(1).max(60).optional(),
  group: z.union([z.uuid(), z.literal(NO_CLIENT_TAG_GROUP)]).optional(),
});
export type SearchClientTagsQuery = z.input<typeof SearchClientTagsQuerySchema>;

export const CreateClientTagGroupInputSchema = z.object({ name: Name });
export type CreateClientTagGroupInput = z.input<typeof CreateClientTagGroupInputSchema>;

export const RenameClientTagGroupInputSchema = z.object({ groupId: z.uuid(), name: Name });
export type RenameClientTagGroupInput = z.input<typeof RenameClientTagGroupInputSchema>;

export const ClientTagGroupIdInputSchema = z.object({ groupId: z.uuid() });
export type ClientTagGroupIdInput = z.input<typeof ClientTagGroupIdInputSchema>;

const ClientTagFieldsSchema = z.object({
  /** Sin grupo: etiqueta suelta. */
  groupId: z.uuid().optional(),
  name: Name,
});
export const CreateClientTagInputSchema = ClientTagFieldsSchema;
export type CreateClientTagInput = z.input<typeof CreateClientTagInputSchema>;

export const UpdateClientTagInputSchema = ClientTagFieldsSchema.extend({ tagId: z.uuid() });
export type UpdateClientTagInput = z.input<typeof UpdateClientTagInputSchema>;

export const ClientTagIdInputSchema = z.object({ tagId: z.uuid() });
export type ClientTagIdInput = z.input<typeof ClientTagIdInputSchema>;

/** Unificar etiquetas: los contactos de `sourceTagId` pasan a `targetTagId` y la primera se borra. */
export const MergeClientTagsInputSchema = z
  .object({ sourceTagId: z.uuid(), targetTagId: z.uuid() })
  .refine((input) => input.sourceTagId !== input.targetTagId, {
    message: 'Elegí otra etiqueta.',
    path: ['targetTagId'],
  });
export type MergeClientTagsInput = z.input<typeof MergeClientTagsInputSchema>;

/** Las etiquetas que quedan en el contacto: se suma y se quita la diferencia. */
export const ChangeClientTagsInputSchema = z.object({
  clientId: z.uuid(),
  tagIds: z.array(z.uuid()).max(MAX_TAGS_PER_CLIENT, 'Son demasiadas etiquetas.'),
});
export type ChangeClientTagsInput = z.input<typeof ChangeClientTagsInputSchema>;

export interface ClientTagGroupRow {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly tagCount: number;
  /** Contactos activos con alguna etiqueta del grupo. */
  readonly clientCount: number;
}

export interface ClientTagRow {
  readonly id: string;
  readonly name: string;
  readonly groupId: string | undefined;
  readonly groupName: string | undefined;
  /** Contactos activos que la tienen. */
  readonly clients: number;
}

/** Una etiqueta en la ficha o en un selector. */
export interface ClientTagRef {
  readonly id: string;
  readonly name: string;
  readonly groupName: string | undefined;
}
