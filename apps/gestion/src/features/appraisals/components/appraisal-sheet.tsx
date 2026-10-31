'use client';

import { EntitySheet, type PanelNavigation } from '../../shared/components/entity-sheet';
import { AppraisalForm } from './appraisal-form';

/**
 * Alta de una tasación en el panel lateral del listado (`?panel=new`). Al guardarla, se abre su
 * ficha.
 */
export function AppraisalSheet({ navigation }: { readonly navigation: PanelNavigation }) {
  const { panel, close } = navigation;
  return (
    <EntitySheet
      open={panel?.kind === 'new'}
      onClose={close}
      width="wide"
      title="Nueva tasación"
      description="Nace solicitada; el resultado se carga cuando esté tasada."
    >
      {panel?.kind === 'new' && <AppraisalForm onCancel={close} />}
    </EntitySheet>
  );
}
