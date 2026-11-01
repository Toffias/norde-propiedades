import { z } from 'zod';

const ShortText = z.string().max(300);

const ChatPropertyCardSchema = z.object({
  id: z.string().max(64),
  title: ShortText,
  url: z.string().max(500),
  photoUrl: z.string().max(500).nullable(),
  operation: z.string().max(40),
  price: z.string().max(40),
  location: ShortText,
  rooms: z.number().nullable(),
  bedrooms: z.number().nullable(),
  surfaceM2: z.number().nullable(),
});

/** Un mensaje del chat, tal como lo muestra el widget y lo recuerda el navegador. */
const ChatEntrySchema = z.object({
  id: z.string().min(1).max(64),
  role: z.enum(['visitor', 'assistant']),
  text: z.string().max(5000),
  photoUrl: z.string().max(500).nullable(),
  // Los mensajes guardados antes de las tarjetas no tienen el campo.
  cards: z.array(ChatPropertyCardSchema).max(10).default([]),
  listingUrl: z.string().max(1000).nullable().default(null),
  buttons: z.array(z.object({ id: z.string().max(64), title: z.string().max(40) })).max(3),
  /** Aviso de error del sitio, no del agente: se muestra distinto. */
  error: z.boolean(),
});

export type ChatEntry = z.infer<typeof ChatEntrySchema>;

const STORAGE_KEY = 'norde-chat:v1';
/** Cuándo fue el último mensaje (epoch en ms), para saber si el agente todavía recuerda la charla. */
const ACTIVITY_KEY = 'norde-chat:last-activity';
/** Solo se recuerdan los últimos mensajes: la memoria de la charla la tiene el agente. */
export const MAX_STORED_ENTRIES = 50;

const TranscriptSchema = z.array(ChatEntrySchema).max(MAX_STORED_ENTRIES);

/**
 * Lo que el visitante ya vio, para no perderlo al recargar. Vive en su navegador: si falta o no
 * es válido (otra versión, almacenamiento bloqueado), el chat arranca vacío.
 */
export function loadTranscript(): ChatEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = TranscriptSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    // Almacenamiento bloqueado o JSON corrupto: el chat arranca vacío.
    return [];
  }
}

export function saveTranscript(entries: readonly ChatEntry[]): void {
  try {
    if (entries.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_STORED_ENTRIES)));
  } catch {
    // Sin almacenamiento (modo privado, cuota llena): el chat sigue funcionando sin recordar.
  }
}

export function loadLastActivity(): number | null {
  try {
    const parsed = z.coerce
      .number()
      .int()
      .positive()
      .safeParse(window.localStorage.getItem(ACTIVITY_KEY));
    return parsed.success ? parsed.data : null;
  } catch {
    // Almacenamiento bloqueado: sin dato, la charla guardada se toma como inactiva.
    return null;
  }
}

/** Registra un mensaje (enviado o recibido) ahora; `null` lo olvida (charla nueva). */
export function saveLastActivity(at: number | null = Date.now()): void {
  try {
    if (at === null) window.localStorage.removeItem(ACTIVITY_KEY);
    else window.localStorage.setItem(ACTIVITY_KEY, String(at));
  } catch {
    // Sin almacenamiento: el chat sigue funcionando sin recordar.
  }
}

/**
 * La charla guardada ya no la recuerda el agente: pasó su período de inactividad. Sin fecha del
 * último mensaje (charlas guardadas antes de registrarla), se toma como inactiva.
 */
export function isTranscriptInactive(input: {
  readonly entries: readonly ChatEntry[];
  readonly lastActivityAt: number | null;
  readonly idleResetMs: number;
  readonly now?: number;
}): boolean {
  if (input.entries.length === 0) return false;
  if (input.lastActivityAt === null) return true;
  return (input.now ?? Date.now()) - input.lastActivityAt > input.idleResetMs;
}
