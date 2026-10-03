'use client';

import {
  CreateDevelopmentUnitInputSchema,
  CURRENCIES,
  OPERATIONS,
  type CreateDevelopmentUnitInput,
  type PanelPropertyRow,
  type PropertyType,
} from '@norde/core/properties/contracts';
import type { Page } from '@norde/core/shared';
import { Button } from '@norde/ui/components/button';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import { Form } from '@norde/ui/components/form';
import { SheetBody, SheetFooter } from '@norde/ui/components/sheet';
import { toast } from '@norde/ui/components/sonner';
import { StatusPill } from '@norde/ui/components/status-pill';
import { Loader2Icon, PlusIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { EMPTY_VALUE } from '../../../lib/format';
import { contractResolver } from '../../../lib/form';
import {
  CURRENCY_LABELS,
  OPERATION_LABELS,
  PROPERTY_STATUS_DISPLAY,
  PROPERTY_TYPE_LABELS,
} from '../../properties/labels';
import { operationPrice } from '../../properties/property-format';
import { EntitySheet, usePanel, type PanelNavigation } from '../../shared/components/entity-sheet';
import { FormAlert } from '../../shared/components/form-alert';
import { NumberField, SelectField, TextField } from '../../shared/components/form-fields';
import { ServerDataTable } from '../../shared/components/server-data-table';
import { createDevelopmentUnitAction } from '../actions';

const area = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

function propertyHref(row: PanelPropertyRow): Route {
  // La ficha de la unidad (una propiedad): typedRoutes no verifica un segmento armado.
  return `/propiedades/${row.id}` as Route;
}

/** "3 amb. · Departamento". */
function typology(row: PanelPropertyRow): string {
  const rooms = row.attributes.rooms;
  const type = PROPERTY_TYPE_LABELS[row.propertyType];
  return rooms === undefined ? type : `${rooms.toString()} amb. · ${type}`;
}

/** "4° A", "PB", o vacío. */
function floorAndUnit(row: PanelPropertyRow): string {
  const floor =
    row.floor === undefined ? undefined : /^\d+$/.test(row.floor) ? `${row.floor}°` : row.floor;
  const parts = [floor, row.unit].filter((part) => part !== undefined);
  return parts.length === 0 ? EMPTY_VALUE : parts.join(' ');
}

function surface(row: PanelPropertyRow): string {
  const { surfaceTotalM2: total, surfaceCoveredM2: covered } = row.attributes;
  if (total === undefined && covered === undefined) return EMPTY_VALUE;
  if (covered === undefined || covered === total) return `${area.format(total ?? 0)} m²`;
  return `${area.format(total ?? covered)} m² (${area.format(covered)} cub.)`;
}

const COLUMNS: readonly DataTableColumn<PanelPropertyRow>[] = [
  {
    id: 'code',
    header: 'Código',
    sortable: true,
    className: 'w-[110px] font-medium tabular-nums',
    cell: (row) => (
      <Link
        href={propertyHref(row)}
        className="text-primary-700 hover:underline dark:text-primary-400"
      >
        {row.code}
      </Link>
    ),
  },
  { id: 'typology', header: 'Tipología', cell: typology },
  {
    id: 'floor',
    header: 'Piso y unidad',
    className: 'whitespace-nowrap',
    cell: floorAndUnit,
  },
  {
    id: 'surface',
    header: 'Superficie',
    showFrom: 'md',
    className: 'whitespace-nowrap tabular-nums',
    cell: surface,
  },
  {
    id: 'price',
    header: 'Precio',
    showFrom: 'sm',
    cell: (row) =>
      row.operations.length === 0 ? (
        <span className="text-muted-foreground">{EMPTY_VALUE}</span>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {row.operations.map((operation) => (
            <li key={operation.operation} className="whitespace-nowrap">
              <span className="text-muted-foreground">{OPERATION_LABELS[operation.operation]}</span>{' '}
              <span className="font-medium tabular-nums">{operationPrice(operation)}</span>
            </li>
          ))}
        </ul>
      ),
  },
  {
    id: 'status',
    header: 'Estado',
    className: 'w-[130px]',
    cell: (row) => (
      <StatusPill tone={PROPERTY_STATUS_DISPLAY[row.status].tone}>
        {PROPERTY_STATUS_DISPLAY[row.status].label}
      </StatusPill>
    ),
  },
];

/**
 * La pestaña Unidades: las propiedades del emprendimiento, paginadas en el servidor (el buscador de
 * propiedades filtrado por emprendimiento). Cada fila abre la ficha de la unidad.
 */
export function UnitsGrid({
  developmentId,
  page,
  sort,
  canAdd,
  enabledTypes,
}: {
  readonly developmentId: string;
  readonly page: Page<PanelPropertyRow>;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
  readonly canAdd: boolean;
  readonly enabledTypes: readonly PropertyType[];
}) {
  const router = useRouter();
  // La ficha ya usa `tab` para sus pestañas.
  const navigation = usePanel({ keepTab: true });
  return (
    <>
      <ServerDataTable
        label="Unidades del emprendimiento"
        columns={COLUMNS}
        rows={page.items}
        total={page.total}
        page={page.page}
        pageSize={page.pageSize}
        sort={sort}
        getRowId={(row) => row.id}
        onRowClick={(row, event) => {
          if (event.ctrlKey || event.metaKey) {
            window.open(propertyHref(row), '_blank', 'noopener');
            return;
          }
          router.push(propertyHref(row));
        }}
        toolbar={
          canAdd ? (
            <div className="flex w-full justify-end">
              <Button onClick={navigation.openNew}>
                <PlusIcon className="h-4 w-4" />
                Nueva unidad
              </Button>
            </div>
          ) : undefined
        }
        empty="Todavía no hay unidades. Sumalas con “Nueva unidad”."
      />
      {canAdd && (
        <UnitSheet
          navigation={navigation}
          developmentId={developmentId}
          enabledTypes={enabledTypes}
        />
      )}
    </>
  );
}

type UnitValues = CreateDevelopmentUnitInput;
type ValidUnitValues = Parameters<typeof createDevelopmentUnitAction>[0];

function UnitSheet({
  navigation,
  developmentId,
  enabledTypes,
}: {
  readonly navigation: PanelNavigation;
  readonly developmentId: string;
  readonly enabledTypes: readonly PropertyType[];
}) {
  const { panel, close } = navigation;
  return (
    <EntitySheet
      open={panel?.kind === 'new'}
      onClose={close}
      title="Nueva unidad"
      description="Hereda la dirección, la ubicación, los servicios y el captador del emprendimiento. El resto se completa en su ficha."
    >
      {panel?.kind === 'new' && (
        <UnitForm developmentId={developmentId} enabledTypes={enabledTypes} onDone={close} />
      )}
    </EntitySheet>
  );
}

function UnitForm({
  developmentId,
  enabledTypes,
  onDone,
}: {
  readonly developmentId: string;
  readonly enabledTypes: readonly PropertyType[];
  readonly onDone: () => void;
}) {
  const [error, setError] = useState<string | undefined>();
  const form = useForm<UnitValues, unknown, ValidUnitValues>({
    resolver: contractResolver(CreateDevelopmentUnitInputSchema),
    defaultValues: {
      developmentId,
      propertyType: enabledTypes[0] ?? 'apartment',
      operation: 'sale',
      currency: 'USD',
      price: '',
      floor: '',
      unit: '',
    },
  });
  const { control } = form;
  const pending = form.formState.isSubmitting;

  async function submit(values: ValidUnitValues) {
    setError(undefined);
    try {
      const result = await createDevelopmentUnitAction(values);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success(`Unidad ${result.code ?? ''} creada como borrador`);
      onDone();
    } catch {
      setError(UNEXPECTED_ERROR_MESSAGE);
    }
  }

  return (
    <Form {...form}>
      <form
        className="flex min-h-0 flex-1 flex-col"
        noValidate
        onSubmit={(event) => void form.handleSubmit(submit)(event)}
      >
        <SheetBody scroll className="flex flex-col gap-4">
          <FormAlert message={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              control={control}
              name="propertyType"
              label="Tipo"
              options={enabledTypes}
              labels={PROPERTY_TYPE_LABELS}
            />
            <NumberField control={control} name="rooms" label="Ambientes" step="1" />
            <TextField control={control} name="floor" label="Piso" autoComplete="off" />
            <TextField control={control} name="unit" label="Unidad" autoComplete="off" />
            <NumberField control={control} name="surfaceTotalM2" label="Superficie total (m²)" />
            <NumberField
              control={control}
              name="surfaceCoveredM2"
              label="Superficie cubierta (m²)"
            />
            <SelectField
              control={control}
              name="operation"
              label="Operación"
              options={OPERATIONS}
              labels={OPERATION_LABELS}
            />
            <SelectField
              control={control}
              name="currency"
              label="Moneda"
              options={CURRENCIES}
              labels={CURRENCY_LABELS}
            />
            <TextField
              control={control}
              name="price"
              label="Precio (opcional)"
              inputMode="decimal"
              description="Sin puntos de miles."
            />
          </div>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Crear unidad
          </Button>
        </SheetFooter>
      </form>
    </Form>
  );
}
