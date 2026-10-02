'use client';

import type { ClientDetail } from '@norde/core/clients/contracts';
import { Badge } from '@norde/ui/components/badge';
import { Button } from '@norde/ui/components/button';
import { PagedMultiSelect, type ComboboxOption } from '@norde/ui/components/paged-combobox';
import { useState } from 'react';

import {
  InlineFormActions,
  InlineSection,
  type InlineFormControls,
} from '../../shared/components/inline-section';
import { changeClientTagsAction, loadClientTagOptions } from '../tag-actions';

/** Las etiquetas del contacto, con su grupo. Se editan con un selector paginado. */
export function ClientTagsSection({ detail }: { readonly detail: ClientDetail }) {
  return (
    <InlineSection
      title="Etiquetas"
      canEdit={detail.can.edit}
      view={
        detail.tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin etiquetas.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {detail.tags.map((tag) => (
              <li key={tag.id}>
                <Badge variant="secondary">
                  {tag.groupName === undefined ? tag.name : `${tag.groupName}: ${tag.name}`}
                </Badge>
              </li>
            ))}
          </ul>
        )
      }
      form={(controls) => <TagsForm detail={detail} controls={controls} />}
    />
  );
}

function TagsForm({
  detail,
  controls,
}: {
  readonly detail: ClientDetail;
  readonly controls: InlineFormControls;
}) {
  const [tags, setTags] = useState<readonly ComboboxOption[]>(
    detail.tags.map((tag) => ({
      value: tag.id,
      label: tag.name,
      ...(tag.groupName === undefined ? {} : { hint: tag.groupName }),
    })),
  );
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        controls.save(
          () => changeClientTagsAction({ clientId: detail.id, tagIds: tags.map((t) => t.value) }),
          'Etiquetas guardadas.',
        );
      }}
    >
      <PagedMultiSelect
        value={tags}
        onChange={setTags}
        loadPage={loadClientTagOptions}
        placeholder="Elegí las etiquetas"
        searchPlaceholder="Buscar etiqueta"
        aria-label="Etiquetas del contacto"
      />
      <div className="flex flex-col-reverse justify-between gap-2 sm:flex-row">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setTags([]);
          }}
        >
          Quitar todas
        </Button>
        <InlineFormActions controls={controls} />
      </div>
    </form>
  );
}
