'use client';

import {
  CreateBranchInputSchema,
  type BranchDetail,
  type CreateBranchInput,
} from '@norde/core/identity/contracts';
import { Button } from '@norde/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@norde/ui/components/dialog';
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
import { toast } from '@norde/ui/components/sonner';
import { Loader2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { runAction } from '../../../lib/action-result';
import { contractResolver } from '../../../lib/form';
import { createBranchAction, updateBranchAction } from '../actions';
import { FormAlert } from './form-alert';

/** Lo que se edita de una sucursal: el alta y la edición usan los mismos campos del contract. */
type BranchValues = CreateBranchInput;

const TEXT_FIELDS: readonly {
  readonly name: Exclude<keyof BranchValues, 'name'>;
  readonly label: string;
  readonly type?: string;
  readonly description?: string;
}[] = [
  { name: 'address', label: 'Dirección' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Teléfono', type: 'tel' },
  { name: 'whatsapp', label: 'WhatsApp', type: 'tel' },
  {
    name: 'logoUrl',
    label: 'Logo (URL)',
    type: 'url',
    description: 'Se usa en los portales y en las fichas en PDF.',
  },
];

function initialValues(branch: BranchDetail | undefined): BranchValues {
  return {
    name: branch?.name ?? '',
    address: branch?.address ?? '',
    email: branch?.email ?? '',
    phone: branch?.phone ?? '',
    whatsapp: branch?.whatsapp ?? '',
    logoUrl: branch?.logoUrl ?? '',
  };
}

/** Alta de una sucursal. La edición está en su propia pantalla (`BranchForm`). */
export function NewBranchDialog({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva sucursal</DialogTitle>
          <DialogDescription>
            Los datos de contacto aparecen en los portales y en las fichas en PDF.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <BranchForm
            branch={undefined}
            onDone={() => {
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Formulario de una sucursal: alta (sin `branch`) o edición. */
export function BranchForm({
  branch,
  onDone,
}: {
  readonly branch: BranchDetail | undefined;
  readonly onDone: () => void;
}) {
  const [error, setError] = useState<string | undefined>();
  const form = useForm<BranchValues>({
    resolver: contractResolver(CreateBranchInputSchema),
    defaultValues: initialValues(branch),
  });

  async function submit(values: BranchValues) {
    setError(undefined);
    const message = await runAction(() =>
      branch === undefined
        ? createBranchAction(values)
        : updateBranchAction({ branchId: branch.id, ...values }),
    );
    if (message !== undefined) {
      setError(message);
      return;
    }
    toast.success(branch === undefined ? 'Sucursal creada' : 'Cambios guardados');
    onDone();
  }

  const pending = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => void form.handleSubmit(submit)(event)}
      >
        <FormAlert message={error} />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre</FormLabel>
              <FormControl>
                <Input autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {TEXT_FIELDS.map(({ name, label, type, description }) => (
            <FormField
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <FormItem
                  className={name === 'address' || name === 'logoUrl' ? 'sm:col-span-2' : ''}
                >
                  <FormLabel>{label} (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      type={type ?? 'text'}
                      autoComplete="off"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  {description !== undefined && <FormDescription>{description}</FormDescription>}
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            {branch === undefined ? 'Crear sucursal' : 'Guardar cambios'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

/** La edición en su pantalla: al terminar o cancelar, vuelve al listado. */
export function EditBranchForm({ branch }: { readonly branch: BranchDetail }) {
  const router = useRouter();
  return (
    <BranchForm
      branch={branch}
      onDone={() => {
        router.push('/mi-empresa/sucursales');
      }}
    />
  );
}
