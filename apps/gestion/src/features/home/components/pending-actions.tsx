'use client';

import type { UnassignedInquiryRow } from '@norde/core/reporting/contracts';
import { Button } from '@norde/ui/components/button';
import { toast } from '@norde/ui/components/sonner';
import { CheckIcon, Loader2Icon, UserPlusIcon } from 'lucide-react';
import { useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { AssignInquiryDialog } from '../../inquiries/components/assign-inquiry-dialog';
import { markOpportunityContactedAction } from '../../opportunities/pipeline-actions';

// Las acciones de Inicio que corren en el cliente: asignar una consulta y marcar contactada una
// oportunidad. Lo demás (WhatsApp, llamar, abrir la ficha) son links.

/** Abre el mismo diálogo de asignación de la bandeja de consultas. */
export function AssignInquiryButton({
  inquiry,
  pickAgents,
  label = 'Asignar',
  variant = 'default',
  size = 'sm',
}: {
  readonly inquiry: UnassignedInquiryRow;
  readonly pickAgents: boolean;
  readonly label?: string;
  readonly variant?: 'default' | 'outline';
  readonly size?: 'sm' | 'default';
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        onClick={() => {
          setOpen(true);
        }}
      >
        <UserPlusIcon className="h-4 w-4" aria-hidden />
        {label}
      </Button>
      {open && (
        <AssignInquiryDialog
          key={inquiry.id}
          row={inquiry}
          pickAgents={pickAgents}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}

/** "Ya lo contacté": pasa la oportunidad al primer estado de la categoría contactado. */
export function MarkContactedButton({
  opportunityId,
  clientName,
}: {
  readonly opportunityId: string;
  readonly clientName: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const message = await runAction(() => markOpportunityContactedAction({ opportunityId }));
          if (message !== undefined) {
            toast.error(message);
            return;
          }
          toast.success(`${clientName} pasó a contactado`);
        });
      }}
    >
      {pending ? (
        <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <CheckIcon className="h-4 w-4" aria-hidden />
      )}
      Ya lo contacté
    </Button>
  );
}
