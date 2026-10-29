'use client';

import {
  MAX_SEND_MESSAGE_LENGTH,
  MAX_SEND_SUBJECT_LENGTH,
  SHARED_LISTING_CHANNEL_LABELS,
  SHARED_LISTING_LIFETIME_DAY_COUNT,
} from '@norde/core/clients/contracts';
import { Button } from '@norde/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@norde/ui/components/dialog';
import { Input } from '@norde/ui/components/input';
import { Label } from '@norde/ui/components/label';
import { PagedCombobox, type ComboboxOption } from '@norde/ui/components/paged-combobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { toast } from '@norde/ui/components/sonner';
import { Textarea } from '@norde/ui/components/textarea';
import { WhatsAppIcon } from '@norde/ui/components/whatsapp-icon';
import { Loader2Icon, MailIcon, SendIcon } from 'lucide-react';
import { useId, useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { FormAlert } from '../../shared/components/form-alert';
import { loadQuickReplyAction, loadQuickReplyOptions } from '../../quick-replies/actions';
import { sendListingsAction } from '../shared-listing-actions';

export type SendChannel = 'email' | 'whatsapp';

export interface SendRecipients {
  readonly emails: readonly string[];
  readonly phones: readonly string[];
  /** Enmascarados: se manda al primero, sin elegir. */
  readonly masked: boolean;
}

const DEFAULT_MESSAGE = '¡Hola! Te comparto unas propiedades que pueden interesarte.';

/**
 * Mandarle una o varias propiedades a un contacto. Por email sale con la plantilla de Norde; por
 * WhatsApp abre el WhatsApp del asesor con el mensaje y el link escritos (no pasa por el agente).
 * Cada envío es un link que vence y registra si lo abrió y qué le gustó.
 */
export function SendListingsDialog({
  clientId,
  propertyIds,
  subject,
  channel: initialChannel,
  recipients,
  open,
  onOpenChange,
  onSent,
}: {
  readonly clientId: string;
  readonly propertyIds: readonly string[];
  /** Qué se envía, para el texto: "NOR-001" o "3 propiedades". */
  readonly subject: string;
  readonly channel: SendChannel;
  readonly recipients: SendRecipients;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSent?: () => void;
}) {
  const id = useId();
  const [channel, setChannel] = useState<SendChannel>(initialChannel);
  const options = channel === 'email' ? recipients.emails : recipients.phones;
  const [recipient, setRecipient] = useState<string | undefined>(options[0]);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [emailSubject, setEmailSubject] = useState('');
  const [quickReply, setQuickReply] = useState<ComboboxOption | null>(null);
  const [loadingReply, startLoadingReply] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  /** Vuelca la respuesta rápida elegida en el asunto y el mensaje; se pueden ajustar después. */
  function chooseQuickReply(option: ComboboxOption | null) {
    setQuickReply(option);
    if (option === null) return;
    startLoadingReply(async () => {
      setError(undefined);
      try {
        const loaded = await loadQuickReplyAction({ quickReplyId: option.value });
        if (!loaded.ok) {
          setError(loaded.message);
          return;
        }
        setMessage(loaded.value.body);
        setEmailSubject(loaded.value.subject ?? '');
      } catch {
        setError(UNEXPECTED_ERROR_MESSAGE);
      }
    });
  }

  function changeChannel(next: SendChannel) {
    setChannel(next);
    setRecipient((next === 'email' ? recipients.emails : recipients.phones)[0]);
    setError(undefined);
  }

  function close() {
    setError(undefined);
    onOpenChange(false);
  }

  function send() {
    // Se abre la pestaña antes de esperar al servidor: si no, el navegador la bloquea.
    const whatsappTab = channel === 'whatsapp' ? window.open('', '_blank') : null;
    startTransition(async () => {
      setError(undefined);
      let whatsappUrl: string | undefined;
      const failure = await runAction(async () => {
        const result = await sendListingsAction({
          clientId,
          propertyIds: [...propertyIds],
          channel,
          ...(recipients.masked || recipient === undefined ? {} : { recipient }),
          ...(message.trim() === '' ? {} : { message }),
          ...(channel === 'email' && emailSubject.trim() !== '' ? { subject: emailSubject } : {}),
        });
        whatsappUrl = result.whatsappUrl;
        return result;
      });
      if (failure !== undefined) {
        whatsappTab?.close();
        setError(failure);
        return;
      }
      if (whatsappUrl !== undefined) {
        if (whatsappTab) {
          whatsappTab.opener = null;
          whatsappTab.location.href = whatsappUrl;
        } else {
          window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
        }
        toast.success('Se abrió WhatsApp con el mensaje. Envialo desde ahí.');
      } else {
        toast.success('Email enviado');
      }
      onSent?.();
      close();
    });
  }

  const noRecipient = options.length === 0;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle icon={SendIcon}>Enviar {subject}</DialogTitle>
          <DialogDescription>
            Le llega un link para ver las propiedades y marcar cuáles le gustan. Vence a los{' '}
            {SHARED_LISTING_LIFETIME_DAY_COUNT} días y lo podés revocar desde la pestaña Envíos.
          </DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />
        <div className="flex flex-col gap-4">
          <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-channel`}>Por</Label>
              <Select
                value={channel}
                onValueChange={(value) => {
                  changeChannel(value === 'whatsapp' ? 'whatsapp' : 'email');
                }}
              >
                <SelectTrigger id={`${id}-channel`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">{SHARED_LISTING_CHANNEL_LABELS.email}</SelectItem>
                  <SelectItem value="whatsapp">{SHARED_LISTING_CHANNEL_LABELS.whatsapp}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-recipient`}>
                {channel === 'email' ? 'Email' : 'Teléfono'}
              </Label>
              {noRecipient ? (
                <p className="py-2 text-sm text-muted-foreground">
                  {channel === 'email' ? 'No tiene email cargado.' : 'No tiene teléfono cargado.'}
                </p>
              ) : (
                <Select
                  value={recipient ?? ''}
                  onValueChange={setRecipient}
                  disabled={recipients.masked || options.length === 1}
                >
                  <SelectTrigger id={`${id}-recipient`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-quick-reply`}>Respuesta rápida (opcional)</Label>
            <PagedCombobox
              id={`${id}-quick-reply`}
              value={quickReply}
              onChange={chooseQuickReply}
              loadPage={loadQuickReplyOptions}
              placeholder="Elegí una plantilla"
              searchPlaceholder="Buscar por nombre"
              emptyText="No hay respuestas rápidas activas."
              disabled={loadingReply}
            />
          </div>
          {channel === 'email' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-subject`}>Asunto (opcional)</Label>
              <Input
                id={`${id}-subject`}
                value={emailSubject}
                maxLength={MAX_SEND_SUBJECT_LENGTH}
                placeholder="Sin asunto, va uno con el nombre de la empresa"
                onChange={(event) => {
                  setEmailSubject(event.target.value);
                }}
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-message`}>Mensaje</Label>
            <Textarea
              id={`${id}-message`}
              value={message}
              maxLength={MAX_SEND_MESSAGE_LENGTH}
              rows={4}
              onChange={(event) => {
                setMessage(event.target.value);
              }}
            />
            <p className="text-xs text-muted-foreground">
              {channel === 'email'
                ? 'Va arriba de las propiedades, con tu nombre como firma.'
                : 'El link se agrega al final del mensaje.'}{' '}
              Las variables como [[primer_nombre_contacto]] se completan al enviar.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={send} disabled={pending || loadingReply || noRecipient}>
            {pending ? (
              <Loader2Icon className="animate-spin" />
            ) : channel === 'email' ? (
              <MailIcon />
            ) : (
              <WhatsAppIcon />
            )}
            {channel === 'email' ? 'Enviar email' : 'Abrir WhatsApp'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
