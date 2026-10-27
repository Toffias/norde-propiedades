import { z } from 'zod';

import { pageQuerySchema } from '../../shared/contracts/pagination';

// Respuestas rápidas: plantillas de mensaje para los envíos (#105). Los topes replican los del
// dominio (`quick-reply.ts`); un test verifica que coincidan.

export const MAX_QUICK_REPLY_NAME_LENGTH = 80;
export const MAX_QUICK_REPLY_SUBJECT_LENGTH = 150;
export const MAX_QUICK_REPLY_BODY_LENGTH = 1000;

/** Replica `QUICK_REPLY_VARIABLES` del dominio, con lo que se muestra al cargar la plantilla. */
export const QUICK_REPLY_VARIABLE_LABELS = {
  nombre_contacto: 'Nombre completo del contacto',
  primer_nombre_contacto: 'Primer nombre del contacto',
  nombre_asesor: 'Tu nombre (quien envía)',
  nombre_empresa: 'Nombre de la empresa',
} as const;

const quickReplyFields = {
  name: z.string().trim().min(1, 'Ingresá un nombre.').max(MAX_QUICK_REPLY_NAME_LENGTH),
  subject: z
    .string()
    .trim()
    .max(
      MAX_QUICK_REPLY_SUBJECT_LENGTH,
      `El asunto puede tener hasta ${MAX_QUICK_REPLY_SUBJECT_LENGTH} caracteres.`,
    )
    .optional(),
  body: z
    .string()
    .trim()
    .min(1, 'Escribí el mensaje.')
    .max(
      MAX_QUICK_REPLY_BODY_LENGTH,
      `El mensaje puede tener hasta ${MAX_QUICK_REPLY_BODY_LENGTH} caracteres.`,
    ),
};

export const CreateQuickReplyInputSchema = z.object(quickReplyFields);
export type CreateQuickReplyInput = z.input<typeof CreateQuickReplyInputSchema>;

export const UpdateQuickReplyInputSchema = z.object({
  quickReplyId: z.uuid(),
  ...quickReplyFields,
});
export type UpdateQuickReplyInput = z.input<typeof UpdateQuickReplyInputSchema>;

export const QuickReplyIdInputSchema = z.object({ quickReplyId: z.uuid() });
export type QuickReplyIdInput = z.input<typeof QuickReplyIdInputSchema>;

export const SetQuickReplyActiveInputSchema = z.object({
  quickReplyId: z.uuid(),
  active: z.boolean(),
});
export type SetQuickReplyActiveInput = z.input<typeof SetQuickReplyActiveInputSchema>;

export interface CreateQuickReplyOutput {
  readonly quickReplyId: string;
}

// ---------- Listado ----------

export const QUICK_REPLY_STATUS_VALUES = ['active', 'inactive'] as const;
export type QuickReplyStatusValue = (typeof QUICK_REPLY_STATUS_VALUES)[number];

export const QUICK_REPLY_SORT_FIELDS = ['name'] as const;

export const ListQuickRepliesQuerySchema = pageQuerySchema({
  sortable: QUICK_REPLY_SORT_FIELDS,
  defaultSort: { field: 'name', direction: 'asc' },
}).extend({
  /** Sin `quick-replies:manage`, solo las activas. */
  status: z.enum(QUICK_REPLY_STATUS_VALUES).default('active'),
  /** Busca en el nombre. */
  q: z.string().trim().max(100).optional(),
});
export type ListQuickRepliesQuery = z.input<typeof ListQuickRepliesQuerySchema>;

/** Una respuesta rápida, en el listado y en el panel de edición. */
export interface QuickReplyRow {
  readonly id: string;
  readonly name: string;
  readonly subject: string | undefined;
  readonly body: string;
  readonly isActive: boolean;
  readonly updatedAt: Date;
}
