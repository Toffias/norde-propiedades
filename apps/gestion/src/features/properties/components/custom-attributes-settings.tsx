'use client';

import {
  CUSTOM_ATTRIBUTE_KIND_VALUES,
  type CustomAttributeKindValue,
  type CustomAttributeRow,
} from '@norde/core/properties/contracts';
import type { Page } from '@norde/core/shared';
import { Button } from '@norde/ui/components/button';
import type { DataTableColumn } from '@norde/ui/components/data-table';
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
import { RowAction, RowActions } from '@norde/ui/components/row-actions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { toast } from '@norde/ui/components/sonner';
import { StatusPill } from '@norde/ui/components/status-pill';
import { Switch } from '@norde/ui/components/switch';
import { Textarea } from '@norde/ui/components/textarea';
import { Loader2Icon, PencilIcon, PlusIcon } from 'lucide-react';
import { useId, useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { FormAlert } from '../../shared/components/form-alert';
import { ServerDataTable } from '../../shared/components/server-data-table';
import { createCustomAttributeAction, updateCustomAttributeAction } from '../detail-actions';
import { CUSTOM_ATTRIBUTE_KIND_LABELS } from '../detail-labels';

/**
 * Atributos personalizados de la ficha (Mi empresa → Propiedades): los que Norde suma además de
 * los estándar. No se borran ni cambian de tipo (hay propiedades con valores); se desactivan.
 */
export function CustomAttributesSettings({
  page,
  disabled,
}: {
  readonly page: Page<CustomAttributeRow>;
  readonly disabled: boolean;
}) {
  const [editing, setEditing] = useState<CustomAttributeRow | 'new' | undefined>();

  const columns: readonly DataTableColumn<CustomAttributeRow>[] = [
    {
      id: 'name',
      header: 'Nombre',
      cell: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      id: 'kind',
      header: 'Tipo',
      cell: (row) => CUSTOM_ATTRIBUTE_KIND_LABELS[row.kind],
    },
    {
      id: 'options',
      header: 'Opciones',
      showFrom: 'md',
      cell: (row) => (
        <span className="text-muted-foreground">
          {row.kind === 'select' ? row.options.join(', ') : '—'}
        </span>
      ),
    },
    {
      id: 'state',
      header: 'Estado',
      cell: (row) =>
        row.isActive ? (
          <StatusPill tone="green">Activo</StatusPill>
        ) : (
          <StatusPill tone="gray">Desactivado</StatusPill>
        ),
    },
    {
      id: 'actions',
      header: 'Acciones',
      hideHeader: true,
      className: 'w-0',
      cell: (row) =>
        disabled ? null : (
          <RowActions>
            <RowAction
              icon={PencilIcon}
              label="Editar"
              onClick={() => {
                setEditing(row);
              }}
            />
          </RowActions>
        ),
    },
  ];

  return (
    <>
      <ServerDataTable
        label="Atributos personalizados"
        columns={columns}
        getRowId={(row) => row.id}
        rows={page.items}
        total={page.total}
        page={page.page}
        pageSize={page.pageSize}
        toolbar={
          disabled ? undefined : (
            <Button
              size="sm"
              onClick={() => {
                setEditing('new');
              }}
            >
              <PlusIcon className="h-4 w-4" />
              Nuevo atributo
            </Button>
          )
        }
        empty="Todavía no hay atributos personalizados."
      />
      {editing !== undefined && (
        <CustomAttributeDialog
          attribute={editing === 'new' ? undefined : editing}
          onClose={() => {
            setEditing(undefined);
          }}
        />
      )}
    </>
  );
}

function CustomAttributeDialog({
  attribute,
  onClose,
}: {
  readonly attribute: CustomAttributeRow | undefined;
  readonly onClose: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(attribute?.name ?? '');
  const [kind, setKind] = useState<CustomAttributeKindValue>(attribute?.kind ?? 'text');
  const [options, setOptions] = useState(attribute?.options.join('\n') ?? '');
  const [isActive, setIsActive] = useState(attribute?.isActive ?? true);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function save() {
    const list = options
      .split('\n')
      .map((option) => option.trim())
      .filter((option) => option !== '');
    setError(undefined);
    startTransition(async () => {
      const failure = await runAction(() =>
        attribute === undefined
          ? createCustomAttributeAction({ name, kind, options: list, isActive })
          : updateCustomAttributeAction({
              attributeId: attribute.id,
              name,
              options: list,
              isActive,
            }),
      );
      if (failure !== undefined) {
        setError(failure);
        return;
      }
      toast.success(attribute === undefined ? 'Atributo creado.' : 'Atributo actualizado.');
      onClose();
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {attribute === undefined ? 'Nuevo atributo' : 'Editar atributo'}
          </DialogTitle>
          <DialogDescription>Aparece en la ficha de todas las propiedades.</DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-name`}>Nombre</Label>
            <Input
              id={`${id}-name`}
              maxLength={60}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-kind`}>Tipo</Label>
            <Select
              value={kind}
              disabled={attribute !== undefined}
              onValueChange={(value) => {
                setKind(CUSTOM_ATTRIBUTE_KIND_VALUES.find((option) => option === value) ?? 'text');
              }}
            >
              <SelectTrigger id={`${id}-kind`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CUSTOM_ATTRIBUTE_KIND_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {CUSTOM_ATTRIBUTE_KIND_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {attribute !== undefined && (
              <p className="text-xs text-muted-foreground">
                El tipo no se cambia: hay propiedades con valores cargados.
              </p>
            )}
          </div>
          {kind === 'select' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-options`}>Opciones (una por línea)</Label>
              <Textarea
                id={`${id}-options`}
                rows={5}
                value={options}
                onChange={(event) => {
                  setOptions(event.target.value);
                }}
              />
            </div>
          )}
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
            Se ofrece en la ficha
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={pending || name.trim() === ''}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
