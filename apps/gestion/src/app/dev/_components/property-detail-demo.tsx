'use client';

import { Button } from '@norde/ui/components/button';
import { DarkHeader } from '@norde/ui/components/dark-header';
import { SectionCard } from '@norde/ui/components/section-card';
import { StatusPill } from '@norde/ui/components/status-pill';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@norde/ui/components/table';
import { TablePagination } from '@norde/ui/components/table-pagination';
import { DETAIL_PAGE_SIZES } from '@norde/ui/lib/pagination';
import { ArrowLeftIcon, BuildingIcon, PencilIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { formatDate, formatDateOnly, formatMoney } from '../../../lib/format';
import { CHANNEL_LABELS, DEMO_CONTACTS, DEMO_PROPERTIES } from './demo-data';

const FACTS: readonly { label: string; value: string }[] = [
  { label: 'Operación', value: 'Venta' },
  { label: 'Tipo', value: 'Departamento' },
  { label: 'Ambientes', value: '3' },
  { label: 'Dormitorios', value: '2' },
  { label: 'Superficie total', value: '78 m²' },
  { label: 'Superficie cubierta', value: '71 m²' },
  { label: 'Expensas', value: formatMoney({ amountCents: 18_500_000n, currency: 'ARS' }) },
  { label: 'Disponible desde', value: formatDateOnly('2026-11-01') },
];

function Facts({ items }: { readonly items: readonly { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="text-sm font-medium tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Patrón de ficha: volver, cabecera oscura y bloques en SectionCard. Las tablas paginan de a 5. */
export function PropertyDetailDemo() {
  const property = DEMO_PROPERTIES[0];
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DETAIL_PAGE_SIZES[0]);
  const inquiries = DEMO_CONTACTS.slice(0, 13);
  const rows = inquiries.slice((page - 1) * pageSize, page * pageSize);
  if (!property) return null;

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/dev/design-system/grilla"
        className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Volver a propiedades
      </Link>

      <DarkHeader
        icon={BuildingIcon}
        title={property.title}
        subtitle={`${property.neighborhood} · ${property.code} · ${formatMoney(property.price)}`}
        aside={
          <>
            <StatusPill tone="green">Publicada</StatusPill>
            <Button size="sm" variant="outline" className="dark:bg-card">
              <PencilIcon className="h-4 w-4" />
              Editar
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard
          title="Datos"
          action={
            <Button size="sm" variant="ghost">
              Editar
            </Button>
          }
        >
          <Facts items={FACTS} />
        </SectionCard>
        <SectionCard title="Propietario">
          <Facts
            items={[
              { label: 'Nombre', value: 'Marcela Ibáñez' },
              { label: 'Teléfono', value: '+54 9 11 4567-8901' },
              { label: 'Autorización', value: 'Exclusiva' },
              { label: 'Vence', value: formatDateOnly('2027-03-31') },
            ]}
          />
        </SectionCard>
      </div>

      <SectionCard title="Consultas">
        <div className="-mx-5 -my-5">
          <div className="table-responsive">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Contacto</TableHead>
                  <TableHead className="hidden md:table-cell">Canal</TableHead>
                  <TableHead className="pr-5 text-right">Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell className="pl-5 font-medium">{contact.name}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {CHANNEL_LABELS[contact.channel]}
                    </TableCell>
                    <TableCell className="pr-5 text-right text-muted-foreground">
                      {formatDate(contact.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={inquiries.length}
            pageSizes={DETAIL_PAGE_SIZES}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </div>
      </SectionCard>
    </div>
  );
}
