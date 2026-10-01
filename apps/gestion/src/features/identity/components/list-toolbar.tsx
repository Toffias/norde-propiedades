'use client';

import type { TrashViewValue } from '@norde/core/identity/contracts';
import { Input } from '@norde/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { SearchIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useListNavigation } from '../../shared/components/server-data-table';

/** Búsqueda por nombre (con debounce) y, si se puede, la papelera. Va en el toolbar de la grilla. */
export function NameSearchToolbar({
  text,
  view,
  canSeeTrash,
  activeLabel,
}: {
  readonly text: string;
  readonly view: TrashViewValue;
  readonly canSeeTrash: boolean;
  /** Cómo se llama la vista normal ("Sucursales", "Equipos"). */
  readonly activeLabel: string;
}) {
  const { setParams } = useListNavigation();
  const [search, setSearch] = useState(text);

  useEffect(() => {
    if (search.trim() === text) return;
    const timer = setTimeout(() => {
      setParams({ q: search.trim() });
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [search, text, setParams]);

  return (
    <>
      <div className="relative w-full sm:max-w-[280px]">
        <SearchIcon className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Buscar por nombre"
          aria-label="Buscar por nombre"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
      </div>
      {canSeeTrash && (
        <Select
          value={view}
          onValueChange={(next) => {
            setParams({ view: next === 'active' ? undefined : next });
          }}
        >
          <SelectTrigger className="w-full sm:w-[160px]" aria-label="Qué ver">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{activeLabel}</SelectItem>
            <SelectItem value="trash">Papelera</SelectItem>
          </SelectContent>
        </Select>
      )}
    </>
  );
}
