'use client';

import {
  CreateQuickReplyInputSchema,
  MAX_QUICK_REPLY_BODY_LENGTH,
  QUICK_REPLY_VARIABLE_LABELS,
  type CreateQuickReplyInput,
  type QuickReplyRow,
} from '@norde/core/clients/contracts';
import { Badge } from '@norde/ui/components/badge';
import { Button } from '@norde/ui/components/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@norde/ui/components/form';
import { Input } from '@norde/ui/components/input';
import { SheetBody, SheetFooter } from '@norde/ui/components/sheet';
import { toast } from '@norde/ui/components/sonner';
import { Textarea } from '@norde/ui/components/textarea';
import { Loader2Icon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

import { runAction } from '../../../lib/action-result';
import { contractResolver } from '../../../lib/form';
import type { PanelData } from '../../../lib/panel-params';
import {
  EntitySheet,
  SheetError,
  SheetLoading,
  useLastDefined,
  type PanelNavigation,
} from '../../shared/components/entity-sheet';
import { FormAlert } from '../../shared/components/form-alert';
import { createQuickReplyAction, updateQuickReplyAction } from '../actions';

type QuickReplyValues = CreateQuickReplyInput;

const VARIABLES = Object.entries(QUICK_REPLY_VARIABLE_LABELS).map(([name, label]) => ({
  token: `[[${name}]]`,
  label,
}));

function initialValues(reply: QuickReplyRow | undefined): QuickReplyValues {
  return { name: reply?.name ?? '', subject: reply?.subject ?? '', body: reply?.body ?? '' };
}

/** Alta y edición de una respuesta rápida en el panel lateral. */
export function QuickReplySheet({
  navigation,
  detail,
}: {
  readonly navigation: PanelNavigation;
  /** La respuesta del panel de edición, cargada por la página. */
  readonly detail: PanelData<QuickReplyRow> | undefined;
}) {
  const { panel, close } = navigation;
  const shown = useLastDefined(panel);
  const data = useLastDefined(detail);
  const creating = shown?.kind === 'new';
  const ready = shown?.kind === 'edit' && data?.id === shown.id ? data : undefined;

  return (
    <EntitySheet
      open={panel !== undefined}
      onClose={close}
      width="default"
      title={creating ? 'Nueva respuesta rápida' : 'Editar respuesta rápida'}
      description={
        creating
          ? 'Una plantilla para el mensaje de los envíos por email o WhatsApp.'
          : ready?.ok === true
            ? ready.value.name
            : undefined
      }
    >
      {creating ? (
        <QuickReplyForm key="new" reply={undefined} onDone={close} />
      ) : ready === undefined ? (
        <SheetLoading />
      ) : !ready.ok ? (
        <SheetError message={ready.message} />
      ) : (
        <QuickReplyForm key={ready.id} reply={ready.value} onDone={close} />
      )}
    </EntitySheet>
  );
}

function QuickReplyForm({
  reply,
  onDone,
}: {
  readonly reply: QuickReplyRow | undefined;
  readonly onDone: () => void;
}) {
  const [error, setError] = useState<string | undefined>();
  const body = useRef<HTMLTextAreaElement | null>(null);
  const form = useForm<QuickReplyValues>({
    resolver: contractResolver(CreateQuickReplyInputSchema),
    defaultValues: initialValues(reply),
  });

  /** Agrega la variable donde está el cursor del mensaje (o al final). */
  function insertVariable(token: string) {
    const current = form.getValues('body');
    const element = body.current;
    const start = element?.selectionStart ?? current.length;
    const end = element?.selectionEnd ?? current.length;
    form.setValue('body', `${current.slice(0, start)}${token}${current.slice(end)}`, {
      shouldDirty: true,
    });
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function submit(values: QuickReplyValues) {
    setError(undefined);
    const message = await runAction(() =>
      reply === undefined
        ? createQuickReplyAction(values)
        : updateQuickReplyAction({ quickReplyId: reply.id, ...values }),
    );
    if (message !== undefined) {
      setError(message);
      return;
    }
    toast.success(reply === undefined ? 'Respuesta rápida creada' : 'Cambios guardados');
    onDone();
  }

  const pending = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form
        className="flex min-h-0 flex-1 flex-col"
        noValidate
        onSubmit={(event) => void form.handleSubmit(submit)(event)}
      >
        <SheetBody scroll>
          <FormAlert message={error} />
          <div className="flex flex-col gap-4">
            {reply?.isActive === false && (
              <p className="text-sm text-muted-foreground">
                <Badge variant="secondary" className="mr-2">
                  Inactiva
                </Badge>
                No se ofrece al enviar hasta que la actives.
              </p>
            )}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormDescription>Así la vas a buscar al enviar.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Asunto (opcional)</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormDescription>
                    Solo para el email. Sin asunto, va uno con el nombre de la empresa y cuántas
                    propiedades son.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mensaje</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={7}
                      maxLength={MAX_QUICK_REPLY_BODY_LENGTH}
                      {...field}
                      ref={(element) => {
                        field.ref(element);
                        body.current = element;
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    Va arriba de las propiedades. En WhatsApp, el link se agrega al final.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Variables</p>
              <p className="text-xs text-muted-foreground">
                Se completan al enviar. Tocá una para agregarla al mensaje.
              </p>
              <ul className="flex flex-col gap-1.5">
                {VARIABLES.map((variable) => (
                  <li key={variable.token} className="flex flex-wrap items-center gap-2 text-sm">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="font-mono text-xs"
                      onClick={() => {
                        insertVariable(variable.token);
                      }}
                    >
                      {variable.token}
                    </Button>
                    <span className="text-muted-foreground">{variable.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            {reply === undefined ? 'Crear respuesta' : 'Guardar cambios'}
          </Button>
        </SheetFooter>
      </form>
    </Form>
  );
}
