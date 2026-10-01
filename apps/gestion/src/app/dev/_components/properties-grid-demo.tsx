'use client';

import { Input } from '@norde/ui/components/input';
import { PageHeader } from '@norde/ui/components/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { StatusPill } from '@norde/ui/components/status-pill';
import { BuildingIcon, LayoutGridIcon, SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { formatCount, formatMoney } from '../../../lib/format';
import { DEMO_PROPERTIES, PROPERTY_STATUS, type PropertyStatus } from './demo-data';

const PROPERTY_STATUSES: readonly PropertyStatus[] = [
  'published',
  'reserved',
  'paused',
  'withdrawn',
];
const STATUS_FILTERS = ['all', ...PROPERTY_STATUSES] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function pickStatus(value: string): StatusFilter {
  return STATUS_FILTERS.find((option) => option === value) ?? 'all';
}

/** Patrón de grilla de cards clickeables. Los filtros van fuera de la card, con `bg-card` explícito. */
export function PropertiesGridDemo() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const term = search.trim().toLowerCase();
  const properties = DEMO_PROPERTIES.filter(
    (property) =>
      (status === 'all' || property.status === status) &&
      (term === '' ||
        property.title.toLowerCase().includes(term) ||
        property.code.toLowerCase().includes(term)),
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={LayoutGridIcon}
        title="Propiedades"
        subtitle={formatCount(DEMO_PROPERTIES.length, 'propiedad', 'propiedades')}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-[280px]">
          <SearchIcon className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="bg-card pl-8"
            placeholder="Buscar por título o código"
            aria-label="Buscar por título o código"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </div>
        <Select
          value={status}
          onValueChange={(next) => {
            setStatus(pickStatus(next));
          }}
        >
          <SelectTrigger className="w-[180px] bg-card" aria-label="Estado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {PROPERTY_STATUSES.map((key) => (
              <SelectItem key={key} value={key}>
                {PROPERTY_STATUS[key].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {properties.length === 0 ? (
        <p className="text-sm leading-normal text-muted-foreground">
          No hay propiedades que coincidan con los filtros.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {properties.map((property) => (
            <Link
              key={property.id}
              href="/dev/design-system/ficha"
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-3xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex h-[38px] w-[38px] items-center justify-center rounded-lg bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                  <BuildingIcon className="h-5 w-5" aria-hidden />
                </div>
                <StatusPill tone={PROPERTY_STATUS[property.status].tone}>
                  {PROPERTY_STATUS[property.status].label}
                </StatusPill>
              </div>
              <div className="min-w-0">
                <p
                  className="truncate text-[14.5px] leading-normal font-extrabold"
                  title={property.title}
                >
                  {property.title}
                </p>
                <p className="truncate text-xs leading-normal text-muted-foreground">
                  {property.code} · {property.operation} · {property.neighborhood}
                </p>
              </div>
              <p className="font-display text-xl font-semibold tabular-nums">
                {formatMoney(property.price)}
              </p>
              <div className="flex gap-6 border-t border-border pt-3 text-xs text-muted-foreground">
                <span>
                  Consultas <b className="text-foreground tabular-nums">{property.inquiries}</b>
                </span>
                <span>
                  Visitas <b className="text-foreground tabular-nums">{property.visits}</b>
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
