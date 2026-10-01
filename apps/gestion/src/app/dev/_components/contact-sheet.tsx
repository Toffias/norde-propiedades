'use client';

import {
  CONTACT_CHANNEL_VALUES,
  OPPORTUNITY_INTENT_VALUES,
  OPPORTUNITY_TYPE_VALUES,
  RegisterContactInputSchema,
  type RegisterContactInput,
} from '@norde/core/clients/contracts';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@norde/ui/components/sheet';
import { toast } from '@norde/ui/components/sonner';
import { Switch } from '@norde/ui/components/switch';
import { Textarea } from '@norde/ui/components/textarea';
import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { contractResolver } from '../../../lib/form';
import { CHANNEL_LABELS, type DemoContact } from './demo-data';

const TYPE_LABELS: Record<(typeof OPPORTUNITY_TYPE_VALUES)[number], string> = {
  sale: 'Compra',
  rent: 'Alquiler',
  appraisal: 'Tasación',
};

const INTENT_LABELS: Record<(typeof OPPORTUNITY_INTENT_VALUES)[number], string> = {
  info: 'Pide información',
  contact: 'Quiere que lo contacten',
  visit: 'Quiere visitar',
};

type ContactForm = RegisterContactInput;
type ContactParsed = z.output<typeof RegisterContactInputSchema>;

function defaults(contact: DemoContact | null): ContactForm {
  return {
    channel: contact?.channel ?? 'whatsapp',
    channelExternalId: contact?.phone ?? '',
    name: contact?.name ?? '',
    phone: contact?.phone ?? '',
    email: contact?.email ?? '',
    opportunity: { type: 'sale', intent: 'info', note: '', noMatchingStock: false },
  };
}

/**
 * Alta y edición en panel lateral, validado con el contract del core (`RegisterContactInputSchema`).
 * Demo: no llama a ninguna Server Action.
 */
export function ContactSheet({
  contact,
  open,
  onOpenChange,
}: {
  /** `null`: alta. */
  readonly contact: DemoContact | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const isEdit = contact !== null;
  const [pending, setPending] = useState(false);
  const form = useForm<ContactForm, unknown, ContactParsed>({
    resolver: contractResolver(RegisterContactInputSchema),
    defaultValues: defaults(contact),
  });

  async function save(values: ContactParsed) {
    setPending(true);
    await new Promise((resolve) => setTimeout(resolve, 700));
    setPending(false);
    onOpenChange(false);
    toast.success(isEdit ? 'Contacto actualizado' : 'Contacto creado', {
      description: `${values.name ?? values.channelExternalId} · demo, no se guardó.`,
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col gap-0 sm:max-w-[560px]">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Editar contacto' : 'Nuevo contacto'}</SheetTitle>
          <SheetDescription>
            {isEdit ? contact.name : 'Lo que llega por un canal y no entró solo al sistema'}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            onSubmit={(event) => void form.handleSubmit(save)(event)}
            className="flex min-h-0 flex-1 flex-col"
            noValidate
          >
            <SheetBody scroll>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre</FormLabel>
                      <FormControl>
                        <Input autoComplete="off" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Teléfono</FormLabel>
                      <FormControl>
                        <Input type="tel" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="channel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Canal</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CONTACT_CHANNEL_VALUES.map((channel) => (
                            <SelectItem key={channel} value={channel}>
                              {CHANNEL_LABELS[channel] ?? channel}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="channelExternalId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ID en el canal</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="opportunity.type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Busca</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {OPPORTUNITY_TYPE_VALUES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {TYPE_LABELS[type]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="opportunity.intent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Intención</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {OPPORTUNITY_INTENT_VALUES.map((intent) => (
                            <SelectItem key={intent} value={intent}>
                              {INTENT_LABELS[intent]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="opportunity.note"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nota para el asesor</FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="opportunity.noMatchingStock"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-3">
                    <div className="grid gap-1">
                      <FormLabel>Aplica a otra inmobiliaria</FormLabel>
                      <FormDescription>
                        Norde no tiene hoy nada para ofrecerle: se revisa con las socias.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </SheetBody>
            <SheetFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
                Guardar
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
