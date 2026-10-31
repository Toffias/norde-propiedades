'use client';

import { FAVORITE_SEARCH_PARAMS, type FavoriteSearchRow } from '@norde/core/properties/contracts';
import { Button } from '@norde/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@norde/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@norde/ui/components/dropdown-menu';
import { Input } from '@norde/ui/components/input';
import { Label } from '@norde/ui/components/label';
import { toast } from '@norde/ui/components/sonner';
import { BookmarkIcon, Loader2Icon, Trash2Icon } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useId, useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { FormAlert } from '../../shared/components/form-alert';
import { deleteFavoriteSearchAction, saveFavoriteSearchAction } from '../actions';

type SearchParamsRecord = Record<string, string | readonly string[]>;

/**
 * Los filtros y el orden actuales del buscador, sin la página ni la vista. Un param repetido (un
 * filtro de varios valores) se guarda como lista.
 */
function currentParams(search: URLSearchParams): SearchParamsRecord {
  return Object.fromEntries(
    FAVORITE_SEARCH_PARAMS.flatMap((key) => {
      const values = search.getAll(key).filter((value) => value !== '');
      if (values.length === 0) return [];
      const [only] = values;
      return [[key, values.length === 1 && only !== undefined ? only : values]];
    }),
  );
}

/** La query string de una búsqueda guardada: las listas vuelven a ser params repetidos. */
function toQuery(params: Readonly<SearchParamsRecord>): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of typeof value === 'string' ? [value] : value) query.append(key, item);
  }
  return query;
}

/**
 * Búsquedas favoritas de quien usa el panel: guardar los filtros actuales con un nombre y volver a
 * abrirlos. Cada usuario ve las suyas.
 */
export function FavoriteSearchesMenu({
  searches,
}: {
  readonly searches: readonly FavoriteSearchRow[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [deletingId, setDeletingId] = useState<string | undefined>();

  function open(search: FavoriteSearchRow) {
    const query = toQuery(search.params);
    const layout = searchParams.get('layout');
    if (layout !== null) query.set('layout', layout);
    const suffix = query.toString();
    router.push(suffix === '' ? '/propiedades' : `/propiedades?${suffix}`);
  }

  function remove(search: FavoriteSearchRow) {
    setDeletingId(search.id);
    startDelete(async () => {
      const message = await runAction(() => deleteFavoriteSearchAction({ searchId: search.id }));
      if (message === undefined) toast.success(`Borraste "${search.name}"`);
      else toast.error(message);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            data-tour="properties-favorites"
            type="button"
            variant="outline"
            className="bg-card"
            aria-label="Búsquedas favoritas"
          >
            <BookmarkIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Búsquedas</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuItem
            onSelect={() => {
              setSaving(true);
            }}
          >
            Guardar esta búsqueda…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Mis búsquedas favoritas</DropdownMenuLabel>
          {searches.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              Todavía no guardaste ninguna.
            </p>
          ) : (
            searches.map((search) => (
              <div key={search.id} className="flex items-center gap-1">
                <DropdownMenuItem
                  className="min-w-0 flex-1"
                  onSelect={() => {
                    open(search);
                  }}
                >
                  <span className="truncate">{search.name}</span>
                </DropdownMenuItem>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label={`Borrar la búsqueda ${search.name}`}
                  disabled={deleting}
                  onClick={() => {
                    remove(search);
                  }}
                >
                  {deleting && deletingId === search.id ? (
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2Icon className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <SaveSearchDialog
        open={saving}
        params={currentParams(searchParams)}
        onOpenChange={setSaving}
      />
    </>
  );
}

function SaveSearchDialog({
  open,
  params,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly params: SearchParamsRecord;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function close(next: boolean) {
    if (!next) {
      setName('');
      setError(undefined);
    }
    onOpenChange(next);
  }

  function save() {
    startTransition(async () => {
      const message = await runAction(() => saveFavoriteSearchAction({ name, params }));
      if (message !== undefined) {
        setError(message);
        return;
      }
      toast.success(`Guardaste "${name.trim()}" en tus búsquedas`);
      close(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <DialogHeader>
            <DialogTitle icon={BookmarkIcon}>Guardar búsqueda</DialogTitle>
            <DialogDescription>
              Se guardan los filtros y el orden actuales. Con un nombre que ya usaste, se
              reemplazan.
            </DialogDescription>
          </DialogHeader>
          <FormAlert message={error} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id}>Nombre</Label>
            <Input
              id={id}
              autoFocus
              maxLength={60}
              placeholder="Ej. Departamentos en venta en Palermo"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                close(false);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || name.trim() === ''}>
              {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
