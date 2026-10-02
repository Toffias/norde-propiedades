/** Persona, empresa o grupo de contactos. Una persona puede pertenecer a empresas y grupos. */
export const CLIENT_KINDS = ['person', 'company', 'group'] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];

/** Qué es el cliente para Norde. Puede tener más de uno. */
export const CLIENT_TYPES = [
  'buyer',
  'tenant',
  'owner_seller',
  'owner_landlord',
  'investor',
] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

/** Los tipos que lo hacen propietario: sus datos de contacto se ven con permiso. */
export const OWNER_CLIENT_TYPES: readonly ClientType[] = ['owner_seller', 'owner_landlord'];

/** Es propietario si tiene alguno de los tipos de propietario. */
export function hasOwnerType(types: readonly ClientType[]): boolean {
  return types.some((type) => OWNER_CLIENT_TYPES.includes(type));
}

export const PHONE_KINDS = ['main', 'mobile', 'work', 'other'] as const;
export type PhoneKind = (typeof PHONE_KINDS)[number];

export const EMAIL_KINDS = ['main', 'work', 'other'] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

/** Datos del contacto que se editan en la ficha y no intervienen en ninguna regla. */
export interface ClientProfile {
  readonly companyName: string | undefined;
  readonly jobTitle: string | undefined;
  readonly website: string | undefined;
  /** `AAAA-MM-DD`, sin hora. */
  readonly birthDate: string | undefined;
  readonly address: string | undefined;
  readonly country: string | undefined;
  readonly language: string | undefined;
  readonly documentType: string | undefined;
  readonly documentNumber: string | undefined;
}

export const EMPTY_PROFILE: ClientProfile = {
  companyName: undefined,
  jobTitle: undefined,
  website: undefined,
  birthDate: undefined,
  address: undefined,
  country: undefined,
  language: undefined,
  documentType: undefined,
  documentNumber: undefined,
};

export const PROFILE_FIELDS: readonly (keyof ClientProfile)[] = [
  'companyName',
  'jobTitle',
  'website',
  'birthDate',
  'address',
  'country',
  'language',
  'documentType',
  'documentNumber',
];
