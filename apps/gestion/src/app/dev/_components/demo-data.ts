import type { MoneyDto } from '@norde/core/properties/contracts';
import type { ComboboxPage, LoadComboboxPage } from '@norde/ui/components/paged-combobox';
import type { StatusTone } from '@norde/ui/components/status-pill';

// Datos ficticios para las pantallas de referencia. No representan clientes ni propiedades reales.

export type PropertyStatus = 'published' | 'reserved' | 'paused' | 'withdrawn';

export const PROPERTY_STATUS: Record<PropertyStatus, { label: string; tone: StatusTone }> = {
  published: { label: 'Publicada', tone: 'green' },
  reserved: { label: 'Reservada', tone: 'amber' },
  paused: { label: 'Pausada', tone: 'gray' },
  withdrawn: { label: 'Retirada', tone: 'red' },
};

export interface DemoProperty {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly operation: 'Venta' | 'Alquiler';
  readonly neighborhood: string;
  readonly price: MoneyDto;
  readonly status: PropertyStatus;
  readonly inquiries: number;
  readonly visits: number;
}

export const DEMO_PROPERTIES: readonly DemoProperty[] = [
  {
    id: 'p1',
    code: 'N-0142',
    title: 'Depto. 3 amb. con balcón',
    operation: 'Venta',
    neighborhood: 'Palermo',
    price: { amountCents: 18_500_000n, currency: 'USD' },
    status: 'published',
    inquiries: 14,
    visits: 5,
  },
  {
    id: 'p2',
    code: 'N-0139',
    title: 'PH 4 amb. con terraza',
    operation: 'Venta',
    neighborhood: 'Villa Crespo',
    price: { amountCents: 21_000_000n, currency: 'USD' },
    status: 'reserved',
    inquiries: 22,
    visits: 9,
  },
  {
    id: 'p3',
    code: 'N-0151',
    title: 'Monoambiente luminoso',
    operation: 'Alquiler',
    neighborhood: 'Almagro',
    price: { amountCents: 42_000_000n, currency: 'ARS' },
    status: 'published',
    inquiries: 31,
    visits: 12,
  },
  {
    id: 'p4',
    code: 'N-0127',
    title: 'Casa 5 amb. con jardín',
    operation: 'Venta',
    neighborhood: 'Olivos',
    price: { amountCents: 39_000_000n, currency: 'USD' },
    status: 'paused',
    inquiries: 6,
    visits: 2,
  },
  {
    id: 'p5',
    code: 'N-0158',
    title: 'Local a la calle',
    operation: 'Alquiler',
    neighborhood: 'Caballito',
    price: { amountCents: 95_000_000n, currency: 'ARS' },
    status: 'published',
    inquiries: 4,
    visits: 1,
  },
  {
    id: 'p6',
    code: 'N-0110',
    title: 'Depto. 2 amb. a estrenar',
    operation: 'Venta',
    neighborhood: 'Núñez',
    price: { amountCents: 14_200_000n, currency: 'USD' },
    status: 'withdrawn',
    inquiries: 9,
    visits: 3,
  },
];

export type ContactStatus = 'new' | 'following' | 'closed';

export const CONTACT_STATUS: Record<
  ContactStatus,
  { label: string; variant: 'info' | 'warning' | 'secondary' }
> = {
  new: { label: 'Nuevo', variant: 'info' },
  following: { label: 'En seguimiento', variant: 'warning' },
  closed: { label: 'Cerrado', variant: 'secondary' },
};

export interface DemoContact {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly email: string | null;
  readonly channel: 'whatsapp' | 'zonaprop' | 'web_form' | 'office';
  readonly interest: string;
  readonly status: ContactStatus;
  readonly createdAt: string;
  /** Motivo por el que no se puede eliminar (ej. tiene un contrato vigente). */
  readonly lockedReason?: string;
}

const FIRST_NAMES = [
  'Ana',
  'Martín',
  'Sofía',
  'Diego',
  'Valeria',
  'Pablo',
  'Lucía',
  'Tomás',
  'Carla',
  'Julián',
  'Florencia',
  'Nicolás',
];
const LAST_NAMES = [
  'Pérez',
  'Rodríguez',
  'Fernández',
  'López',
  'Martínez',
  'García',
  'Romero',
  'Sosa',
  'Álvarez',
  'Torres',
];
const CHANNELS: readonly DemoContact['channel'][] = ['whatsapp', 'zonaprop', 'web_form', 'office'];
const INTERESTS = [
  'Compra · 3 amb. Palermo',
  'Alquiler · monoambiente',
  'Tasación · casa en Olivos',
  'Compra · PH con terraza',
  'Alquiler · local comercial',
];
const STATUSES: readonly ContactStatus[] = ['new', 'following', 'following', 'closed'];

export const DEMO_CONTACTS: readonly DemoContact[] = Array.from({ length: 37 }, (_, index) => {
  const name = `${FIRST_NAMES[index % FIRST_NAMES.length] ?? ''} ${LAST_NAMES[(index * 7) % LAST_NAMES.length] ?? ''}`;
  const day = String(1 + ((index * 3) % 28)).padStart(2, '0');
  return {
    id: `c${String(index + 1)}`,
    name,
    phone: `+54 9 11 5${String(100 + index)}-${String(1000 + index * 37).slice(0, 4)}`,
    email: index % 3 === 0 ? null : `contacto${String(index + 1)}@example.com`,
    channel: CHANNELS[index % CHANNELS.length] ?? 'whatsapp',
    interest: INTERESTS[index % INTERESTS.length] ?? '',
    status: index < 3 ? 'new' : (STATUSES[index % STATUSES.length] ?? 'new'),
    createdAt: `2026-09-${day}T15:30:00Z`,
    ...(index % 9 === 4 ? { lockedReason: 'Tiene un contrato de alquiler vigente.' } : {}),
  };
});

export const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  web_chat: 'Chat de la web',
  web_form: 'Formulario web',
  mercadolibre: 'Mercado Libre',
  zonaprop: 'Zonaprop',
  argenprop: 'Argenprop',
  referral: 'Referido',
  phone_call: 'Llamada',
  office: 'Oficina',
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const PROPERTY_OPTIONS = Array.from({ length: 53 }, (_, index) => {
  const base = DEMO_PROPERTIES[index % DEMO_PROPERTIES.length];
  return {
    value: `opt-${String(index)}`,
    label: `${base?.title ?? ''} · ${base?.neighborhood ?? ''}`,
    hint: `N-${String(200 + index).padStart(4, '0')}`,
  };
});

/** Simula una Server Action paginada de a 20 (con latencia). */
export const loadDemoProperties: LoadComboboxPage = async (search, page) => {
  await sleep(400);
  const term = search.trim().toLowerCase();
  const matches = PROPERTY_OPTIONS.filter(
    (option) =>
      term === '' ||
      option.label.toLowerCase().includes(term) ||
      option.hint.toLowerCase().includes(term),
  );
  const start = (page - 1) * 20;
  const result: ComboboxPage = {
    options: matches.slice(start, start + 20),
    hasMore: start + 20 < matches.length,
  };
  return result;
};
