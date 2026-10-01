'use client';

import { Badge } from '@norde/ui/components/badge';
import { Button } from '@norde/ui/components/button';
import { Card } from '@norde/ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@norde/ui/components/dialog';
import { Input } from '@norde/ui/components/input';
import { PageHeader } from '@norde/ui/components/page-header';
import { RowAction, RowActions } from '@norde/ui/components/row-actions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { Skeleton } from '@norde/ui/components/skeleton';
import { toast } from '@norde/ui/components/sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@norde/ui/components/table';
import { TablePagination } from '@norde/ui/components/table-pagination';
import { Tabs, TabsList, TabsTrigger } from '@norde/ui/components/tabs';
import { Loader2Icon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon, UsersIcon } from 'lucide-react';
import { useState } from 'react';

import { EMPTY_VALUE, formatCount, formatDate } from '../../../lib/format';
import { ContactSheet } from './contact-sheet';
import { CHANNEL_LABELS, CONTACT_STATUS, DEMO_CONTACTS, type DemoContact } from './demo-data';

const DEMO_VIEWS = ['data', 'loading', 'error', 'empty'] as const;
type DemoView = (typeof DEMO_VIEWS)[number];

const STATUS_FILTERS = ['all', 'new', 'following', 'closed'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

/** Radix entrega el valor elegido como `string`: se valida contra las opciones conocidas. */
function pick<T extends string>(options: readonly T[], value: string, fallback: T): T {
  return options.find((option) => option === value) ?? fallback;
}

/**
 * Patrón visual de listado: filtros dentro de la card, tabla, acciones de fila y paginación, con los
 * tres estados (cargando, error, vacío).
 *
 * OJO: es una demo y filtra en memoria. Las pantallas reales siguen
 * `.claude/skills/gestion-feature/grilla-paginada.md`: estado en la URL, query del core paginada
 * en la base y el cliente recibe solo las filas de la página.
 */
export function ContactsListDemo() {
  const [view, setView] = useState<DemoView>('data');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [editing, setEditing] = useState<DemoContact | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleting, setDeleting] = useState<DemoContact | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const term = search.trim().toLowerCase();
  const filtered =
    view === 'empty'
      ? []
      : DEMO_CONTACTS.filter(
          (contact) =>
            (status === 'all' || contact.status === status) &&
            (term === '' ||
              contact.name.toLowerCase().includes(term) ||
              contact.phone.includes(term)),
        );
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const hasFilters = term !== '' || status !== 'all';

  function openSheet(contact: DemoContact | null) {
    setEditing(contact);
    setSheetOpen(true);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeletePending(true);
    await new Promise((resolve) => setTimeout(resolve, 700));
    setDeletePending(false);
    toast.success('Contacto eliminado', { description: `${deleting.name} · demo, no se borró.` });
    setDeleting(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={UsersIcon}
        title="Contactos"
        subtitle={formatCount(DEMO_CONTACTS.length, 'contacto', 'contactos')}
        actions={
          <Button
            size="sm"
            onClick={() => {
              openSheet(null);
            }}
          >
            <PlusIcon className="h-4 w-4" />
            Nuevo contacto
          </Button>
        }
      />

      <Tabs
        value={view}
        onValueChange={(next) => {
          setView(pick(DEMO_VIEWS, next, 'data'));
        }}
      >
        <TabsList aria-label="Estado de la demo">
          <TabsTrigger value="data">Con datos</TabsTrigger>
          <TabsTrigger value="loading">Cargando</TabsTrigger>
          <TabsTrigger value="error">Error</TabsTrigger>
          <TabsTrigger value="empty">Vacío</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="gap-0 overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <div className="relative w-full sm:max-w-[280px]">
            <SearchIcon className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar por nombre o teléfono"
              aria-label="Buscar por nombre o teléfono"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={status}
            onValueChange={(next) => {
              setStatus(pick(STATUS_FILTERS, next, 'all'));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px]" aria-label="Estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="new">Nuevos</SelectItem>
              <SelectItem value="following">En seguimiento</SelectItem>
              <SelectItem value="closed">Cerrados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {view === 'loading' ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : view === 'error' ? (
          <div className="flex flex-col items-start gap-3 p-5">
            <p className="text-sm leading-normal text-muted-foreground">
              No pudimos cargar los contactos.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setView('data');
              }}
            >
              Reintentar
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <p className="p-5 text-sm leading-normal text-muted-foreground">
            {hasFilters
              ? 'No hay contactos que coincidan con los filtros.'
              : 'Todavía no hay contactos. Los que lleguen por WhatsApp o los portales aparecen acá.'}
          </p>
        ) : (
          <>
            <div className="table-responsive">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead className="hidden xl:table-cell">Email</TableHead>
                    <TableHead className="hidden w-[130px] md:table-cell">Canal</TableHead>
                    <TableHead className="hidden 2xl:table-cell">Interés</TableHead>
                    <TableHead className="w-[130px]">Estado</TableHead>
                    <TableHead className="hidden w-[110px] md:table-cell">Alta</TableHead>
                    <TableHead className="w-[100px] text-right">
                      <span className="sr-only">Acciones</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell className="font-medium">
                        {contact.name}
                        {contact.id === 'c1' && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            (vos)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {contact.phone}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground xl:table-cell">
                        {contact.email ?? EMPTY_VALUE}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {CHANNEL_LABELS[contact.channel]}
                      </TableCell>
                      <TableCell
                        className="hidden max-w-[220px] truncate text-muted-foreground 2xl:table-cell"
                        title={contact.interest}
                      >
                        {contact.interest}
                      </TableCell>
                      <TableCell>
                        <Badge variant={CONTACT_STATUS[contact.status].variant}>
                          {CONTACT_STATUS[contact.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {formatDate(contact.createdAt)}
                      </TableCell>
                      <TableCell>
                        <RowActions>
                          <RowAction
                            icon={PencilIcon}
                            label="Editar"
                            onClick={() => {
                              openSheet(contact);
                            }}
                          />
                          <RowAction
                            icon={Trash2Icon}
                            label="Eliminar"
                            destructive
                            onClick={() => {
                              setDeleting(contact);
                            }}
                            {...(contact.lockedReason === undefined
                              ? {}
                              : { disabledReason: contact.lockedReason })}
                          />
                        </RowActions>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </>
        )}
      </Card>

      <ContactSheet
        key={editing?.id ?? 'new'}
        contact={editing}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />

      <Dialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next && !deletePending) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar contacto?</DialogTitle>
            <DialogDescription>
              {deleting?.name} va a la papelera, con sus oportunidades. Lo podés restaurar desde
              ahí.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={deletePending}
              onClick={() => {
                setDeleting(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deletePending}
              onClick={() => void confirmDelete()}
            >
              {deletePending && <Loader2Icon className="h-4 w-4 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
