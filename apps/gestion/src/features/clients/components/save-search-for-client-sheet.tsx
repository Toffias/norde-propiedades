'use client';

import { CURRENCIES, OPERATIONS, PROPERTY_TYPES } from '@norde/core/properties/contracts';
import { Label } from '@norde/ui/components/label';
import { useId, useState } from 'react';

import { EntityPicker } from '../../identity/components/entity-picker';
import { EntitySheet } from '../../shared/components/entity-sheet';
import { loadClientOptions } from '../actions';
import { SavedSearchForm, type SavedSearchPrefill } from './saved-search-form';

/** Los filtros del buscador que se pueden guardar como búsqueda de un contacto. */
export interface SearchFilters {
  readonly operation: string;
  readonly propertyType: string;
  readonly currency: string;
  readonly minPrice: string;
  readonly maxPrice: string;
  /** Texto libre: no se guarda, el catálogo de ubicaciones va por ID. */
  readonly location: string;
}

function prefillFrom(filters: SearchFilters): SavedSearchPrefill {
  const operation = OPERATIONS.find((value) => value === filters.operation);
  const propertyType = PROPERTY_TYPES.find((value) => value === filters.propertyType);
  const currency = CURRENCIES.find((value) => value === filters.currency);
  return {
    ...(operation === undefined ? {} : { operation }),
    ...(propertyType === undefined ? {} : { propertyTypes: [propertyType] }),
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
}: {
  readonly filters: SearchFilters;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const [clientId, setClientId] = useState<string | undefined>();
  const location = filters.location.trim();

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
        notice={
          location === ''
            ? undefined
            : `En el buscador filtraste por "${location}": elegí las ubicaciones del catálogo.`
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
