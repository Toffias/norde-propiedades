'use client';

import { Button } from '@norde/ui/components/button';
import {
  PagedCombobox,
  type ComboboxOption,
  type LoadComboboxPage,
} from '@norde/ui/components/paged-combobox';
import { XIcon } from 'lucide-react';
import { useState } from 'react';

/**
 * Selector paginado con búsqueda que guarda solo el ID (lo que espera el contract). La etiqueta de
 * la opción inicial llega de afuera, así no hay que volver a buscarla.
 */
export function EntityPicker({
  value,
  initial,
  onChange,
  loadPage,
  placeholder,
  searchPlaceholder,
  clearLabel,
  id,
}: {
  readonly value: string | undefined;
  readonly initial: ComboboxOption | undefined;
  readonly onChange: (id: string | undefined) => void;
  readonly loadPage: LoadComboboxPage;
  readonly placeholder: string;
  readonly searchPlaceholder: string;
  /** Si se puede dejar vacío: el texto del botón para quitar la elección. */
  readonly clearLabel?: string;
  /** Para asociarlo a su `<label>` (lo pasa `FormControl`). */
  readonly id?: string;
}) {
  const [selected, setSelected] = useState<ComboboxOption | undefined>(initial);
  const option = value === undefined ? null : selected?.value === value ? selected : null;

  return (
    <div className="flex gap-2">
      <div className="min-w-0 flex-1">
        <PagedCombobox
          value={option}
          onChange={(next) => {
            setSelected(next ?? undefined);
            onChange(next?.value);
          }}
          loadPage={loadPage}
          placeholder={placeholder}
          searchPlaceholder={searchPlaceholder}
          {...(id === undefined ? {} : { id })}
        />
      </div>
      {clearLabel !== undefined && value !== undefined && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={clearLabel}
          onClick={() => {
            setSelected(undefined);
            onChange(undefined);
          }}
        >
          <XIcon className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
