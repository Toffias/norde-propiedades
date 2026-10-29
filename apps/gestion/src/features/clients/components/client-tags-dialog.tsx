'use client';

import type { ClientDetail } from '@norde/core/clients/contracts';

import { TagsDialog } from '../../shared/components/tags-dialog';
import { clientName } from '../client-format';
import { changeClientTagsAction, loadClientTagOptions } from '../tag-actions';

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
  return (
    <TagsDialog
      subject={clientName(detail.name)}
      tags={detail.tags}
      loadPage={loadClientTagOptions}
      save={(tagIds) => changeClientTagsAction({ clientId: detail.id, tagIds })}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}
