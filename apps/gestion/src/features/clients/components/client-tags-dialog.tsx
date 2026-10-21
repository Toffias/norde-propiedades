'use client';

import type { ClientDetail } from '@norde/core/clients/contracts';
import { Badge } from '@norde/ui/components/badge';
import { Button } from '@norde/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@norde/ui/components/dialog';
import { PagedMultiSelect, type ComboboxOption } from '@norde/ui/components/paged-combobox';
import { toast } from '@norde/ui/components/sonner';
import { Loader2Icon } from 'lucide-react';
import { useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { FormAlert } from '../../shared/components/form-alert';
import { clientName } from '../client-format';
import { changeClientTagsAction, loadClientTagOptions } from '../tag-actions';

/** Las etiquetas del contacto, con su grupo; sin etiquetas no muestra nada. */
export function ClientTagList({ tags }: { readonly tags: ClientDetail['tags'] }) {
  if (tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5 lg:justify-end" aria-label="Etiquetas">
      {tags.map((tag) => (
        <li key={tag.id}>
          <Badge variant="secondary">
            {tag.groupName === undefined ? tag.name : `${tag.groupName}: ${tag.name}`}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

/** Elegir las etiquetas del contacto con un selector paginado. */
export function ClientTagsDialog({
  detail,
  open,
  onOpenChange,
}: {
  readonly detail: ClientDetail;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const [tags, setTags] = useState<readonly ComboboxOption[]>(
    detail.tags.map((tag) => ({
      value: tag.id,
      label: tag.name,
      ...(tag.groupName === undefined ? {} : { hint: tag.groupName }),
    })),
  );
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gestionar etiquetas</DialogTitle>
          <DialogDescription>Las etiquetas de {clientName(detail.name)}.</DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />
        <PagedMultiSelect
          value={tags}
          onChange={setTags}
          loadPage={loadClientTagOptions}
          placeholder="Elegí las etiquetas"
          searchPlaceholder="Buscar etiqueta"
          aria-label="Etiquetas del contacto"
        />
        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setTags([]);
            }}
          >
            Quitar todas
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(undefined);
                startTransition(async () => {
                  const message = await runAction(() =>
                    changeClientTagsAction({
                      clientId: detail.id,
                      tagIds: tags.map((t) => t.value),
                    }),
                  );
                  if (message !== undefined) {
                    setError(message);
                    return;
                  }
                  toast.success('Etiquetas guardadas');
                  onOpenChange(false);
                });
              }}
            >
              {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
