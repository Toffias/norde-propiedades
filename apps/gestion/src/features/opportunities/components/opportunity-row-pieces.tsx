'use client';

import type { OpportunityPipelineRow } from '@norde/core/clients/contracts';
import { Button } from '@norde/ui/components/button';
import { WhatsAppIcon } from '@norde/ui/components/whatsapp-icon';
import { initials } from '@norde/ui/lib/initials';
import { cn } from '@norde/ui/lib/utils';
import { HistoryIcon, HouseIcon, StickyNoteIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';

import { clientName, whatsappHref } from '../../clients/client-format';

import type { OpportunityCardTarget } from './opportunity-card-dialogs';

// Lo que comparten una fila de la lista y una tarjeta del tablero.

/** Los diálogos que se abren desde una oportunidad: agregar nota o ver su historial. */
export type OpportunityDialog = 'note' | 'history';

export function opportunityTarget(row: OpportunityPipelineRow): OpportunityCardTarget {
  return { id: row.id, clientId: row.client.id, clientName: clientName(row.client.name) };
}

/** Las iniciales del contacto en un cuadradito: se reconoce de un vistazo. Alto del nombre + badge. */
export function ContactInitials({ name }: { readonly name: string }) {
  return (
    <span
      aria-hidden
      className="inline-flex size-[2.9rem] shrink-0 items-center justify-center rounded-lg bg-secondary text-sm font-semibold text-secondary-foreground"
    >
      {initials(name)}
    </span>
  );
}

/** La propiedad por la que consultó, con link a su ficha. */
export function PropertyLink({
  property,
  className,
}: {
  readonly property: NonNullable<OpportunityPipelineRow['property']>;
  readonly className?: string;
}) {
  return (
    <Link
      // La ficha de la propiedad: typedRoutes no verifica un string armado.
      href={`/propiedades/${property.id}` as Route}
      className={cn(
        'inline-flex min-w-0 items-center gap-1 text-xs text-primary hover:underline',
        className,
      )}
      title={property.title}
    >
      <HouseIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">
        {property.code} · {property.title}
      </span>
    </Link>
  );
}

/** Agregar nota, historial y WhatsApp: los atajos de una oportunidad. */
export function OpportunityQuickActions({
  row,
  onDialog,
}: {
  readonly row: OpportunityPipelineRow;
  readonly onDialog: (row: OpportunityPipelineRow, dialog: OpportunityDialog) => void;
}) {
  const name = clientName(row.client.name);
  const phone = row.client.phone;
  return (
    <div className="flex items-center">
      {row.can.update && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Nota a la oportunidad de ${name}`}
          title="Agregar nota"
          onClick={() => {
            onDialog(row, 'note');
          }}
        >
          <StickyNoteIcon className="h-4 w-4" />
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Historial de la oportunidad de ${name}`}
        title="Historial"
        onClick={() => {
          onDialog(row, 'history');
        }}
      >
        <HistoryIcon className="h-4 w-4" />
      </Button>
      {!row.client.contactMasked && phone !== undefined && (
        <a
          href={whatsappHref(phone)}
          target="_blank"
          rel="noreferrer"
          aria-label={`WhatsApp a ${name}`}
          title="WhatsApp"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <WhatsAppIcon className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}
