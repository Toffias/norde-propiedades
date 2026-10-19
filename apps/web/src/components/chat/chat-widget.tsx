'use client';

import { MessageCircle, RotateCcw, SendHorizontal, Sparkles, X } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { CHAT_MAX_CHARS, type ChatReply } from '../../lib/chat/chat-contract';
import { internalPath } from '../../lib/chat/markdown';
import { resetChatSession, sendChatMessage } from '../../lib/chat/send-chat-message';
import { loadTranscript, saveTranscript, type ChatEntry } from '../../lib/chat/transcript';

import { ChatPropertyCard } from './chat-property-card';
import { ChatText } from './chat-text';

const WELCOME =
  '¡Hola! Soy el asistente virtual de Norde. Contame qué estás buscando: si querés comprar o alquilar, qué tipo de propiedad y en qué zona.';
const SUGGESTIONS = ['Quiero comprar', 'Quiero alquilar', 'Quiero tasar mi propiedad'];
const FAILED = 'No pudimos enviar tu mensaje. Revisá tu conexión y probá de nuevo.';

const CHIP =
  'border-primary/40 text-primary hover:bg-primary/10 focus-visible:ring-ring/50 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors outline-none focus-visible:ring-[3px] disabled:opacity-50';
const ICON_BUTTON =
  'flex size-9 items-center justify-center rounded-full transition-colors outline-none hover:bg-white/15 focus-visible:ring-[3px] focus-visible:ring-white/50';

function assistantEntry(reply: ChatReply): ChatEntry {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    text: reply.text,
    photoUrl: reply.photoUrl,
    cards: [...reply.cards],
    buttons: [...reply.buttons],
    error: false,
  };
}

function errorEntry(message: string): ChatEntry {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    text: message,
    photoUrl: null,
    cards: [],
    buttons: [],
    error: true,
  };
}

function isMobile(): boolean {
  return window.matchMedia('(max-width: 639px)').matches;
}

function TypingIndicator() {
  return (
    <div className="bg-muted flex w-fit items-center gap-1 rounded-2xl rounded-bl-md px-4 py-3">
      <span className="sr-only">El asistente está escribiendo</span>
      {['[animation-delay:-0.3s]', '[animation-delay:-0.15s]', ''].map((delay) => (
        <span
          key={delay}
          aria-hidden
          className={`bg-muted-foreground/60 size-1.5 animate-bounce rounded-full ${delay}`}
        />
      ))}
    </div>
  );
}

/**
 * Burbuja flotante del chat con el agente de IA, en todas las páginas (ADR 0037). En mobile el
 * panel ocupa la pantalla; en desktop es una tarjeta sobre la burbuja.
 */
export function ChatWidget({ siteUrl }: { readonly siteUrl: string }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const panelId = useId();
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loaded) saveTranscript(entries);
  }, [entries, loaded]);

  useEffect(() => {
    // Se mueve solo la lista: `scrollIntoView` también desplazaría la página de atrás.
    const log = logRef.current;
    if (open && log) log.scrollTop = log.scrollHeight;
  }, [open, entries, pending]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Lo ya conversado se lee al abrir por primera vez: no existe en el servidor ni en el HTML.
  const openPanel = () => {
    if (!loaded) {
      setEntries(loadTranscript());
      setLoaded(true);
    }
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    launcherRef.current?.focus();
  };

  const send = async (text: string) => {
    const trimmed = text.trim().slice(0, CHAT_MAX_CHARS);
    if (!trimmed || pending) return;
    const messageId = crypto.randomUUID();
    setEntries((current) => [
      ...current,
      {
        id: messageId,
        role: 'visitor',
        text: trimmed,
        photoUrl: null,
        cards: [],
        buttons: [],
        error: false,
      },
    ]);
    setDraft('');
    setPending(true);
    try {
      const result = await sendChatMessage({ messageId, text: trimmed });
      if (result.status === 'error') {
        setEntries((current) => [...current, errorEntry(result.message)]);
      } else if (result.reply) {
        const reply = result.reply;
        setEntries((current) => [...current, assistantEntry(reply)]);
      }
    } catch {
      // La Server Action no llegó al servidor (red caída, deploy en curso).
      setEntries((current) => [...current, errorEntry(FAILED)]);
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  };

  const restart = async () => {
    setEntries([]);
    await resetChatSession();
    inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(draft);
    }
  };

  // En mobile el panel tapa la página: al ir a una ficha desde el chat, se cierra.
  const onInternalNavigation = () => {
    if (isMobile()) setOpen(false);
  };

  const last = entries.at(-1);
  const quickReplies =
    entries.length === 0
      ? SUGGESTIONS
      : last?.role === 'assistant' && !last.error
        ? last.buttons.map((button) => button.title)
        : [];

  return (
    <>
      {open && (
        <section
          id={panelId}
          role="dialog"
          aria-label="Chat con el asistente de Norde"
          onKeyDown={(event) => {
            if (event.key === 'Escape') close();
          }}
          className="bg-card text-card-foreground animate-in fade-in slide-in-from-bottom-4 fixed inset-0 z-(--z-float) flex flex-col overflow-hidden sm:inset-auto sm:right-6 sm:bottom-24 sm:h-[min(640px,calc(100dvh-8rem))] sm:w-100 sm:rounded-3xl sm:border sm:shadow-2xl"
        >
          <header className="bg-primary text-primary-foreground flex items-center gap-3 px-4 py-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15">
              <Sparkles aria-hidden className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold leading-tight">Asistente de Norde</p>
              <p className="text-xs opacity-85">Te ayudo a encontrar tu propiedad</p>
            </div>
            {entries.length > 0 && (
              <button
                type="button"
                onClick={() => void restart()}
                disabled={pending}
                aria-label="Empezar una conversación nueva"
                title="Conversación nueva"
                className={ICON_BUTTON}
              >
                <RotateCcw aria-hidden className="size-4.5" />
              </button>
            )}
            <button
              type="button"
              onClick={close}
              aria-label="Cerrar el chat"
              className={ICON_BUTTON}
            >
              <X aria-hidden className="size-5" />
            </button>
          </header>

          <div
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-busy={pending}
            className="bg-background flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4 text-sm leading-relaxed"
          >
            <div className="bg-muted max-w-[85%] rounded-2xl rounded-bl-md px-3.5 py-2.5">
              {WELCOME}
            </div>
            {entries.map((entry) =>
              entry.role === 'visitor' ? (
                <div
                  key={entry.id}
                  className="bg-primary text-primary-foreground ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2.5 break-words whitespace-pre-wrap"
                >
                  {entry.text}
                </div>
              ) : (
                <div key={entry.id} className="space-y-2">
                  <div
                    className={`max-w-[85%] space-y-2 rounded-2xl rounded-bl-md px-3.5 py-2.5 ${
                      entry.error ? 'bg-destructive/10 text-destructive' : 'bg-muted'
                    }`}
                  >
                    {entry.photoUrl && <ChatPhoto url={entry.photoUrl} siteUrl={siteUrl} />}
                    <ChatText
                      text={entry.text}
                      siteUrl={siteUrl}
                      onInternalNavigation={onInternalNavigation}
                    />
                  </div>
                  {entry.cards.length > 0 && (
                    <ul aria-label="Propiedades sugeridas" className="space-y-2">
                      {entry.cards.map((card) => (
                        <li key={card.id}>
                          <ChatPropertyCard card={card} siteUrl={siteUrl} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ),
            )}
            {pending && <TypingIndicator />}
            {!pending && quickReplies.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {quickReplies.map((title) => (
                  <button
                    key={title}
                    type="button"
                    onClick={() => void send(title)}
                    className={CHIP}
                  >
                    {title}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
            className="bg-card border-t px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <div className="flex items-end gap-2">
              <label htmlFor={`${panelId}-input`} className="sr-only">
                Tu mensaje
              </label>
              <textarea
                id={`${panelId}-input`}
                ref={inputRef}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                }}
                onKeyDown={onKeyDown}
                rows={1}
                maxLength={CHAT_MAX_CHARS}
                placeholder="Escribí tu consulta…"
                className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 field-sizing-content max-h-32 min-h-11 flex-1 resize-none rounded-2xl border px-3.5 py-2.5 text-base outline-none focus-visible:ring-[3px] sm:text-sm"
              />
              <button
                type="submit"
                disabled={pending || draft.trim() === ''}
                aria-label="Enviar"
                className="bg-primary text-primary-foreground focus-visible:ring-ring/50 flex size-11 shrink-0 items-center justify-center rounded-full transition-opacity outline-none focus-visible:ring-[3px] disabled:opacity-40"
              >
                <SendHorizontal aria-hidden className="size-5" />
              </button>
            </div>
            <p className="text-muted-foreground mt-2 text-center text-[11px]">
              Asistente con IA: puede equivocarse. Un asesor confirma cada dato.
            </p>
          </form>
        </section>
      )}

      <button
        ref={launcherRef}
        type="button"
        onClick={() => {
          if (open) close();
          else openPanel();
        }}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={open ? 'Cerrar el chat' : 'Abrir el chat con el asistente de Norde'}
        className={`bg-primary text-primary-foreground focus-visible:ring-ring/50 fixed right-4 bottom-4 z-(--z-float) flex size-14 items-center justify-center rounded-full shadow-lg transition-transform outline-none hover:scale-105 focus-visible:ring-[3px] sm:right-6 sm:bottom-6 ${
          open ? 'max-sm:hidden' : ''
        }`}
      >
        {open ? (
          <X aria-hidden className="size-6" />
        ) : (
          <MessageCircle aria-hidden className="size-7" />
        )}
      </button>
    </>
  );
}

/** La foto que pidió el agente. Solo se muestran las del propio sitio (`/fotos/…`). */
function ChatPhoto({ url, siteUrl }: { readonly url: string; readonly siteUrl: string }) {
  const path = internalPath(url, siteUrl);
  if (!path?.startsWith('/fotos/')) return null;
  return (
    <Image
      src={path}
      alt="Foto de la propiedad"
      width={480}
      height={360}
      sizes="320px"
      className="aspect-4/3 w-full rounded-xl object-cover"
    />
  );
}
