'use client';

import type { SavedSearchDetail } from '@norde/core/clients/contracts';

import type { PanelData } from '../../../lib/panel-params';
import {
  EntitySheet,
  SheetError,
  SheetLoading,
  useLastDefined,
  type PanelNavigation,
} from '../../shared/components/entity-sheet';
import { SavedSearchForm } from './saved-search-form';

/** Alta y edición de una búsqueda guardada desde la ficha del contacto, en el panel lateral. */
export function SavedSearchSheet({
  navigation,
  clientId,
  detail,
  activeOpportunityId,
  canEdit,
}: {
  readonly navigation: PanelNavigation;
  readonly clientId: string;
  /** La búsqueda del panel de edición, cargada por la página. */
  readonly detail: PanelData<SavedSearchDetail> | undefined;
  readonly activeOpportunityId: string | undefined;
  readonly canEdit: boolean;
}) {
  const { panel, close } = navigation;
  const shown = useLastDefined(panel);
  const data = useLastDefined(detail);
  const creating = shown?.kind === 'new';
  const ready = shown?.kind === 'edit' && data?.id === shown.id ? data : undefined;
  const readOnly = !canEdit || (ready?.ok === true && ready.value.deleted);

  return (
    <EntitySheet
      open={panel !== undefined}
      onClose={close}
      title={creating ? 'Nueva búsqueda' : readOnly ? 'Búsqueda guardada' : 'Editar búsqueda'}
      description="Se cruza con la cartera para calcular la coincidencia de las destacadas."
    >
      {creating ? (
        <SavedSearchForm
          key="new"
          clientId={clientId}
          search={undefined}
          activeOpportunityId={activeOpportunityId}
          readOnly={false}
          onDone={close}
        />
      ) : ready === undefined ? (
        <SheetLoading />
      ) : !ready.ok ? (
        <SheetError message={ready.message} />
      ) : (
        <SavedSearchForm
          key={ready.id}
          clientId={clientId}
          search={ready.value}
          activeOpportunityId={activeOpportunityId}
          readOnly={readOnly}
          onDone={close}
        />
      )}
    </EntitySheet>
  );
}
