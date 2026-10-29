'use client';

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
import {
  PagedMultiSelect,
  type ComboboxOption,
  type LoadComboboxPage,
} from '@norde/ui/components/paged-combobox';
import { toast } from '@norde/ui/components/sonner';
import { cn } from '@norde/ui/lib/utils';
import { Loader2Icon, TagsIcon } from 'lucide-react';
import { useState, useTransition } from 'react';

import { runAction, type ActionResult } from '../../../lib/action-result';
import { FormAlert } from './form-alert';

export interface TagView {
  readonly id: string;
  readonly name: string;
  readonly groupName?: string | undefined;
}

/**
 * Las etiquetas de la ficha, con su grupo; sin etiquetas no muestra nada. `onDark` es para la
 * cabecera oscura de propiedades y emprendimientos.
 */
export function TagList({
  tags,
  onDark = false,
  className,
}: {
  readonly tags: readonly TagView[];
  readonly onDark?: boolean;
  readonly className?: string;
}) {
  if (tags.length === 0) return null;
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)} aria-label="Etiquetas">
      {tags.map((tag) => (
        <li key={tag.id}>
          <Badge
            variant="secondary"
            className={cn(onDark && 'border-white/15 bg-white/10 text-white')}
          >
            {tag.groupName === undefined ? tag.name : `${tag.groupName}: ${tag.name}`}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

/** Elegir las etiquetas de una ficha con un selector paginado; se abre desde su menú de acciones. */
export function TagsDialog({
  subject,
  tags: initial,
  loadPage,
  save,
  open,
  onOpenChange,
}: {
  /** Completa la descripción: «Las etiquetas de {subject}». */
  readonly subject: string;
  readonly tags: readonly TagView[];
  readonly loadPage: LoadComboboxPage;
  readonly save: (tagIds: string[]) => Promise<ActionResult>;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const [tags, setTags] = useState<readonly ComboboxOption[]>(
    initial.map((tag) => ({
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
          <DialogTitle icon={TagsIcon}>Gestionar etiquetas</DialogTitle>
          <DialogDescription>Las etiquetas de {subject}.</DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />
        <PagedMultiSelect
          value={tags}
          onChange={setTags}
          loadPage={loadPage}
          placeholder="Elegí las etiquetas"
          searchPlaceholder="Buscar etiqueta"
          aria-label="Etiquetas"
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
                  const message = await runAction(() => save(tags.map((t) => t.value)));
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
