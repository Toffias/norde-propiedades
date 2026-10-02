// Agenda de contactos del panel (#8): listado, alta, ficha, papelera y exportación.

import { z } from 'zod';

import { historyQuerySchema } from '../../audit/contracts';
import { pageQuerySchema } from '../../shared/contracts';

export const CLIENT_KIND_VALUES = ['person', 'company', 'group'] as const;
export type ClientKindValue = (typeof CLIENT_KIND_VALUES)[number];

export const CLIENT_TYPE_VALUES = [
  'buyer',
  'tenant',
  'owner_seller',
  'owner_landlord',
  'investor',
] as const;
export type ClientTypeValue = (typeof CLIENT_TYPE_VALUES)[number];

export const PHONE_KIND_VALUES = ['main', 'mobile', 'work', 'other'] as const;
export type PhoneKindValue = (typeof PHONE_KIND_VALUES)[number];

export const EMAIL_KIND_VALUES = ['main', 'work', 'other'] as const;
export type EmailKindValue = (typeof EMAIL_KIND_VALUES)[number];

export const DOCUMENT_TYPE_VALUES = ['dni', 'cuit', 'cuil', 'passport', 'other'] as const;
export type DocumentTypeValue = (typeof DOCUMENT_TYPE_VALUES)[number];

/** Textos en español de cada valor: los usan la planilla exportada y el panel. */
export const CLIENT_KIND_LABELS: Readonly<Record<ClientKindValue, string>> = {
  person: 'Persona',
  company: 'Empresa',
  group: 'Grupo de contactos',
};

export const CLIENT_TYPE_LABELS: Readonly<Record<ClientTypeValue, string>> = {
  buyer: 'Comprador',
  tenant: 'Inquilino',
  owner_seller: 'Propietario vendedor',
  owner_landlord: 'Propietario que alquila',
  investor: 'Inversor',
};

export const PHONE_KIND_LABELS: Readonly<Record<PhoneKindValue, string>> = {
  main: 'Principal',
  mobile: 'Celular',
  work: 'Laboral',
  other: 'Otro',
};

export const EMAIL_KIND_LABELS: Readonly<Record<EmailKindValue, string>> = {
  main: 'Principal',
  work: 'Laboral',
  other: 'Otro',
};

export const CONTACT_CHANNEL_LABELS: Readonly<Record<string, string>> = {
  whatsapp: 'WhatsApp',
  web_chat: 'Chat de la web',
  web_form: 'Formulario de la web',
  mercadolibre: 'MercadoLibre',
  zonaprop: 'Zonaprop',
  argenprop: 'Argenprop',
  referral: 'Referido',
  phone_call: 'Llamada',
  office: 'Oficina',
};

export const DOCUMENT_TYPE_LABELS: Readonly<Record<DocumentTypeValue, string>> = {
  dni: 'DNI',
  cuit: 'CUIT',
  cuil: 'CUIL',
  passport: 'Pasaporte',
  other: 'Otro',
};

export const CLIENT_SORT_FIELDS = ['name', 'createdAt', 'updatedAt'] as const;
export type ClientSortField = (typeof CLIENT_SORT_FIELDS)[number];

/** `trash`: la papelera. */
export const CLIENT_VIEW_VALUES = ['active', 'trash'] as const;
export type ClientViewValue = (typeof CLIENT_VIEW_VALUES)[number];

/** Teléfonos y emails por contacto: más que esto es otro contacto o un error de carga. */
export const MAX_CLIENT_PHONES = 6;
export const MAX_CLIENT_EMAILS = 6;

/** En la URL viaja como `true` / `false`; el caso de uso vuelve a validar el booleano ya parseado. */
const BooleanParam = z
  .union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')])
  .default(false);

/** Filtros del listado: los comparten la grilla y la exportación. */
const ClientFilterFields = {
  /** Nombre, email, teléfono, empresa o documento, sin distinguir mayúsculas ni acentos. */
  q: z.string().trim().min(1).max(100).optional(),
  agentId: z.uuid().optional(),
  branchId: z.uuid().optional(),
  clientType: z.enum(CLIENT_TYPE_VALUES).optional(),
  /** Solo propietarios (vendedores o que alquilan). */
  owners: BooleanParam,
  /** Fechas `AAAA-MM-DD` de Buenos Aires, inclusive. */
  createdFrom: z.iso.date().optional(),
  createdTo: z.iso.date().optional(),
  updatedFrom: z.iso.date().optional(),
  updatedTo: z.iso.date().optional(),
  view: z.enum(CLIENT_VIEW_VALUES).default('active'),
};

function checkDateRanges(
  query: {
    readonly createdFrom?: string | undefined;
    readonly createdTo?: string | undefined;
    readonly updatedFrom?: string | undefined;
    readonly updatedTo?: string | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  // Las fechas ISO se comparan bien como texto.
  for (const [from, to] of [
    ['createdFrom', 'createdTo'],
    ['updatedFrom', 'updatedTo'],
  ] as const) {
    const start = query[from];
    const end = query[to];
    if (start !== undefined && end !== undefined && start > end) {
      ctx.addIssue({
        code: 'custom',
        message: 'La fecha "desde" es posterior a "hasta".',
        path: [to],
      });
    }
  }
}

export const ListClientsQuerySchema = pageQuerySchema({
  sortable: CLIENT_SORT_FIELDS,
  defaultSort: { field: 'updatedAt', direction: 'desc' },
})
  .extend(ClientFilterFields)
  .superRefine(checkDateRanges);
export type ListClientsQuery = z.input<typeof ListClientsQuerySchema>;

/** Los filtros sin página ni orden (exportación de "todos los que cumplen"). */
export const ClientFilterSchema = z.object(ClientFilterFields).superRefine(checkDateRanges);
export type ClientFilter = z.input<typeof ClientFilterSchema>;

export interface ClientUserRef {
  readonly id: string;
  /** `undefined` si el usuario ya no está activo. */
  readonly name: string | undefined;
}

/** Fila de la grilla de contactos. */
export interface ClientListRow {
  readonly id: string;
  readonly kind: ClientKindValue;
  readonly name: string | undefined;
  readonly companyName: string | undefined;
  /** El primer teléfono que no es celular. */
  readonly phone: string | undefined;
  /** El primer celular. */
  readonly mobile: string | undefined;
  readonly email: string | undefined;
  readonly clientTypes: readonly ClientTypeValue[];
  readonly agent: ClientUserRef | undefined;
  /** Es propietario y el actor no puede ver sus datos: teléfono y email van enmascarados. */
  readonly contactMasked: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Solo en la papelera. */
  readonly deletedAt: Date | undefined;
  readonly deletedBy: ClientUserRef | undefined;
}

export const ClientIdInputSchema = z.object({ clientId: z.uuid() });
export type ClientIdInput = z.input<typeof ClientIdInputSchema>;

// ---------- Alta y edición ----------

const PhoneInputSchema = z.object({
  kind: z.enum(PHONE_KIND_VALUES),
  number: z.string().trim().min(1).max(40),
  contactHours: z.string().trim().max(80).optional(),
});
export type ClientPhoneInput = z.input<typeof PhoneInputSchema>;

const EmailInputSchema = z.object({
  kind: z.enum(EMAIL_KIND_VALUES),
  address: z.string().trim().min(1).max(254),
});
export type ClientEmailInput = z.input<typeof EmailInputSchema>;

/** Texto opcional de la ficha: vacío borra el dato. */
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const ClientProfileInputSchema = z.object({
  companyName: optionalText(120),
  jobTitle: optionalText(120),
  website: optionalText(200),
  birthDate: z.union([z.iso.date(), z.literal('')]).optional(),
  address: optionalText(200),
  country: optionalText(60),
  language: optionalText(40),
  documentType: z.union([z.enum(DOCUMENT_TYPE_VALUES), z.literal('')]).optional(),
  documentNumber: optionalText(30),
});
export type ClientProfileInput = z.input<typeof ClientProfileInputSchema>;

const PhonesSchema = z.array(PhoneInputSchema).max(MAX_CLIENT_PHONES);
const EmailsSchema = z.array(EmailInputSchema).max(MAX_CLIENT_EMAILS);
const ClientTypesSchema = z.array(z.enum(CLIENT_TYPE_VALUES)).max(CLIENT_TYPE_VALUES.length);

export const CreateClientInputSchema = z.object({
  kind: z.enum(CLIENT_KIND_VALUES).default('person'),
  name: z.string().trim().min(1, 'Ingresá el nombre.').max(120),
  phones: PhonesSchema.default([]),
  emails: EmailsSchema.default([]),
  clientTypes: ClientTypesSchema.default([]),
  /** Sin agente, queda a cargo de quien lo da de alta. */
  agentId: z.uuid().optional(),
  profile: ClientProfileInputSchema.default({}),
});
export type CreateClientInput = z.input<typeof CreateClientInputSchema>;

export interface CreateClientOutput {
  readonly clientId: string;
}

/**
 * Cada sección de la ficha se guarda por separado: una sección que no viene no cambia. Los datos
 * (`profile`) se guardan enteros: un campo ausente se borra.
 */
/** Los teléfonos y emails de la ficha, que se guardan juntos: el primero de cada lista es el principal. */
export const ClientContactInputSchema = z.object({ phones: PhonesSchema, emails: EmailsSchema });
export type ClientContactInput = z.input<typeof ClientContactInputSchema>;

export const UpdateClientDetailsInputSchema = z.object({
  clientId: z.uuid(),
  name: z.string().trim().min(1, 'Ingresá el nombre.').max(120).optional(),
  kind: z.enum(CLIENT_KIND_VALUES).optional(),
  contact: ClientContactInputSchema.optional(),
  clientTypes: ClientTypesSchema.optional(),
  profile: ClientProfileInputSchema.optional(),
});
export type UpdateClientDetailsInput = z.input<typeof UpdateClientDetailsInputSchema>;

export const ReassignClientInputSchema = z.object({
  clientId: z.uuid(),
  /** `null`: queda sin agente. */
  agentId: z.uuid().nullable(),
});
export type ReassignClientInput = z.input<typeof ReassignClientInputSchema>;

// ---------- Duplicados ----------

export const CheckClientDuplicatesInputSchema = z.object({
  name: z.string().trim().max(120).optional(),
  phones: z.array(z.string().trim().min(1).max(40)).max(MAX_CLIENT_PHONES).default([]),
  emails: z.array(z.string().trim().min(1).max(254)).max(MAX_CLIENT_EMAILS).default([]),
});
export type CheckClientDuplicatesInput = z.input<typeof CheckClientDuplicatesInputSchema>;

/** Un contacto que coincide con el que se está cargando. */
export interface ClientDuplicateRef {
  readonly id: string;
  readonly name: string | undefined;
  readonly agent: ClientUserRef | undefined;
  /** Está en la papelera: se ofrece restaurarlo en vez de crear otro. */
  readonly trashed: boolean;
  /** El actor puede abrir su ficha (es suyo, de su sucursal o ve todos). */
  readonly canOpen: boolean;
}

export interface ClientDuplicates {
  /** Mismo teléfono o email: no se puede crear otro. */
  readonly existing: ClientDuplicateRef | undefined;
  /** Mismo nombre, otros datos de contacto: puede ser la misma persona. */
  readonly possible: readonly ClientDuplicateRef[];
}

// ---------- Ficha ----------

export interface ClientDetailPhone {
  readonly kind: PhoneKindValue;
  readonly number: string;
  readonly contactHours: string | undefined;
}

export interface ClientDetailEmail {
  readonly kind: EmailKindValue;
  readonly address: string;
}

export interface ClientDetailChannel {
  readonly channel: string;
  readonly firstContactAt: Date;
  readonly lastContactAt: Date;
}

export interface ClientDetailProfile {
  readonly companyName: string | undefined;
  readonly jobTitle: string | undefined;
  readonly website: string | undefined;
  readonly birthDate: string | undefined;
  readonly address: string | undefined;
  readonly country: string | undefined;
  readonly language: string | undefined;
  readonly documentType: string | undefined;
  readonly documentNumber: string | undefined;
}

/** Qué puede hacer el actor en la ficha. La UI lo usa para mostrar u ocultar; el caso de uso decide. */
export interface ClientDetailPermissions {
  readonly edit: boolean;
  readonly rename: boolean;
  readonly reassign: boolean;
  readonly delete: boolean;
  readonly viewHistory: boolean;
}

export interface ClientDetail {
  readonly id: string;
  readonly kind: ClientKindValue;
  readonly name: string | undefined;
  readonly phones: readonly ClientDetailPhone[];
  readonly emails: readonly ClientDetailEmail[];
  readonly clientTypes: readonly ClientTypeValue[];
  readonly agent: ClientUserRef | undefined;
  readonly branchId: string | undefined;
  readonly profile: ClientDetailProfile;
  readonly channels: readonly ClientDetailChannel[];
  /** Teléfonos, emails y documento enmascarados: es propietario y el actor no puede verlos. */
  readonly contactMasked: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | undefined;
  readonly deletedBy: ClientUserRef | undefined;
  readonly can: ClientDetailPermissions;
}

// ---------- Historial ----------

export const ListClientHistoryQuerySchema = historyQuerySchema().extend({ clientId: z.uuid() });
export type ListClientHistoryQuery = z.input<typeof ListClientHistoryQuerySchema>;

// ---------- Exportar ----------

/** Una planilla más grande conviene pedirla filtrando: se arma por lotes, pero tiene un tope. */
export const MAX_CLIENT_EXPORT_ROWS = 10_000;

export const ExportClientsInputSchema = z.object({ filter: ClientFilterSchema });
export type ExportClientsInput = z.input<typeof ExportClientsInputSchema>;
