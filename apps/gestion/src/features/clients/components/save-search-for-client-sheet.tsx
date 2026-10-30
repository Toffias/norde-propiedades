'use client';

import { CURRENCIES, OPERATIONS, PROPERTY_TYPES } from '@norde/core/properties/contracts';
import { Label } from '@norde/ui/components/label';
import type { ComboboxOption } from '@norde/ui/components/paged-combobox';
import { useId, useState } from 'react';

import { EntityPicker } from '../../identity/components/entity-picker';
import { EntitySheet } from '../../shared/components/entity-sheet';
import { loadClientOptions } from '../actions';
import { SavedSearchForm, type SavedSearchPrefill } from './saved-search-form';

/** Los filtros del buscador que se pueden guardar como búsqueda de un contacto. */
export interface SearchFilters {
  readonly operation: readonly string[];
  readonly propertyType: readonly string[];
  readonly currency: string;
  readonly minPrice: string;
  readonly maxPrice: string;
  /** Las ubicaciones del catálogo elegidas en el buscador, con su nombre. */
  readonly locationOptions: readonly ComboboxOption[];
}

function prefillFrom(filters: SearchFilters): SavedSearchPrefill {
  // La búsqueda de un contacto tiene una sola operación: con varias, se elige en el formulario.
  const [only] = filters.operation.length === 1 ? filters.operation : [];
  const operation = OPERATIONS.find((value) => value === only);
  const propertyTypes = PROPERTY_TYPES.filter((value) => filters.propertyType.includes(value));
  const currency = CURRENCIES.find((value) => value === filters.currency);
  return {
    ...(operation === undefined ? {} : { operation }),
    ...(propertyTypes.length === 0 ? {} : { propertyTypes }),
    ...(filters.locationOptions.length === 0 ? {} : { locations: filters.locationOptions }),
    ...(currency === undefined ? {} : { currency }),
    ...(filters.minPrice === '' ? {} : { minPrice: filters.minPrice }),
    ...(filters.maxPrice === '' ? {} : { maxPrice: filters.maxPrice }),
  };
}

/**
 * "Guardar para un contacto" del buscador de propiedades: la búsqueda nueva arranca con los filtros
 * de la pantalla y se le guarda al contacto que se elija.
 */
export function SaveSearchForClientSheet({
  filters,
  open,
  onOpenChange,
  canTurnOnAutoSend,
}: {
  readonly filters: SearchFilters;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly canTurnOnAutoSend: boolean;
}) {
  const id = useId();
  const [clientId, setClientId] = useState<string | undefined>();
  const manyOperations = filters.operation.length > 1;

  return (
    <EntitySheet
      open={open}
      onClose={() => {
        onOpenChange(false);
      }}
      title="Guardar búsqueda para un contacto"
      description="Arranca con los filtros del buscador. Se cruza con la cartera para calcular la coincidencia de sus destacadas."
    >
      <SavedSearchForm
        clientId={clientId}
        search={undefined}
        prefill={prefillFrom(filters)}
        activeOpportunityId={undefined}
        readOnly={false}
        canTurnOnAutoSend={canTurnOnAutoSend}
        notice={
          manyOperations
            ? 'En el buscador elegiste varias operaciones: la búsqueda de un contacto tiene una sola.'
            : undefined
        }
        before={
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-client`}>Contacto</Label>
            <EntityPicker
              id={`${id}-client`}
              value={clientId}
              initial={undefined}
              onChange={setClientId}
              loadPage={loadClientOptions}
              placeholder="Buscalo por nombre, teléfono o email"
              searchPlaceholder="Buscar contacto"
            />
          </div>
        }
        onDone={() => {
          onOpenChange(false);
        }}
      />
    </EntitySheet>
  );
}
