'use client';

import { Badge } from '@norde/ui/components/badge';
import { Button } from '@norde/ui/components/button';
import { Checkbox } from '@norde/ui/components/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@norde/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@norde/ui/components/dropdown-menu';
import { FileChip, FileDropzone } from '@norde/ui/components/file-dropzone';
import { Input } from '@norde/ui/components/input';
import { Label } from '@norde/ui/components/label';
import {
  PagedCombobox,
  PagedMultiSelect,
  type ComboboxOption,
} from '@norde/ui/components/paged-combobox';
import { PageHeader } from '@norde/ui/components/page-header';
import { PasswordInput } from '@norde/ui/components/password-input';
import { Popover, PopoverContent, PopoverTrigger } from '@norde/ui/components/popover';
import { SectionCard } from '@norde/ui/components/section-card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { Skeleton } from '@norde/ui/components/skeleton';
import { toast } from '@norde/ui/components/sonner';
import { SoftBadge, StatusPill } from '@norde/ui/components/status-pill';
import { Switch } from '@norde/ui/components/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@norde/ui/components/tabs';
import { Textarea } from '@norde/ui/components/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@norde/ui/components/tooltip';
import {
  InfoIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PaletteIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react';
import { useState } from 'react';

import { loadDemoProperties } from './demo-data';

// Las clases se escriben completas (no se arman con template strings) para que Tailwind las vea.
const SCALES: readonly {
  name: string;
  swatches: readonly { label: string; className: string }[];
}[] = [
  {
    name: 'Primario',
    swatches: [
      { label: '50', className: 'bg-primary-50' },
      { label: '100', className: 'bg-primary-100' },
      { label: '200', className: 'bg-primary-200' },
      { label: '300', className: 'bg-primary-300' },
      { label: '400', className: 'bg-primary-400' },
      { label: '500', className: 'bg-primary-500' },
      { label: '600', className: 'bg-primary-600' },
      { label: '700', className: 'bg-primary-700' },
      { label: '800', className: 'bg-primary-800' },
      { label: '900', className: 'bg-primary-900' },
    ],
  },
  {
    name: 'Arena',
    swatches: [
      { label: '50', className: 'bg-gray-50' },
      { label: '100', className: 'bg-gray-100' },
      { label: '200', className: 'bg-gray-200' },
      { label: '300', className: 'bg-gray-300' },
      { label: '400', className: 'bg-gray-400' },
      { label: '500', className: 'bg-gray-500' },
      { label: '600', className: 'bg-gray-600' },
      { label: '700', className: 'bg-gray-700' },
      { label: '800', className: 'bg-gray-800' },
      { label: '900', className: 'bg-gray-900' },
    ],
  },
  {
    name: 'Estados',
    swatches: [
      { label: 'success', className: 'bg-success-500' },
      { label: 'warning', className: 'bg-warning-500' },
      { label: 'danger', className: 'bg-danger-500' },
      { label: 'info', className: 'bg-info-500' },
      { label: 'violet', className: 'bg-violet-600' },
    ],
  },
  {
    name: 'Carbón',
    swatches: [
      { label: 'dark-1', className: 'bg-surface-dark-1' },
      { label: 'dark-2', className: 'bg-surface-dark-2' },
      { label: 'dark-3', className: 'bg-surface-dark-3' },
      { label: 'dark-4', className: 'bg-surface-dark-4' },
    ],
  },
];

const SEMANTIC: readonly { label: string; className: string }[] = [
  { label: 'background', className: 'bg-background' },
  { label: 'card', className: 'bg-card' },
  { label: 'muted', className: 'bg-muted' },
  { label: 'primary', className: 'bg-primary' },
  { label: 'destructive', className: 'bg-destructive' },
  { label: 'border', className: 'bg-border' },
  { label: 'input', className: 'bg-input' },
  { label: 'sheet-header', className: 'bg-sheet-header' },
  { label: 'sidebar', className: 'bg-sidebar' },
];

const TYPE_SCALE: readonly { label: string; className: string }[] = [
  { label: 'text-xs · 12 px', className: 'text-xs' },
  { label: 'text-sm · 13 px', className: 'text-sm' },
  { label: 'text-base · 14 px', className: 'text-base' },
  { label: 'text-md · 16 px', className: 'text-md' },
  { label: 'text-lg · 18 px', className: 'text-lg' },
  { label: 'text-xl · 20 px', className: 'text-xl' },
  { label: 'text-2xl · 26 px', className: 'text-2xl' },
  { label: 'text-3xl · 32 px', className: 'text-3xl' },
];

function Swatch({ label, className }: { readonly label: string; readonly className: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className={`h-10 rounded-md border border-border ${className}`} />
      <span className="truncate text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function Row({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs leading-normal font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

export function ComponentsDemo() {
  const [property, setProperty] = useState<ComboboxOption | null>(null);
  const [properties, setProperties] = useState<readonly ComboboxOption[]>([]);
  const [files, setFiles] = useState<readonly string[]>(['contrato-firmado.pdf']);
  const [saving, setSaving] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={PaletteIcon}
        title="Componentes"
        subtitle="Tokens y componentes de @norde/ui con el tema del panel."
      />

      <SectionCard title="Color">
        <div className="flex flex-col gap-5">
          {SCALES.map((scale) => (
            <Row key={scale.name} title={scale.name}>
              <div className="grid w-full grid-cols-5 gap-2 sm:grid-cols-10">
                {scale.swatches.map((swatch) => (
                  <Swatch key={swatch.label} {...swatch} />
                ))}
              </div>
            </Row>
          ))}
          <Row title="Tokens semánticos (cambian con el tema)">
            <div className="grid w-full grid-cols-3 gap-2 sm:grid-cols-9">
              {SEMANTIC.map((swatch) => (
                <Swatch key={swatch.label} {...swatch} />
              ))}
            </div>
          </Row>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Tipografía">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h1>Space Grotesk para títulos</h1>
              <p className="leading-normal text-muted-foreground">
                IBM Plex Sans para el cuerpo, los controles y las tablas.
              </p>
            </div>
            {TYPE_SCALE.map((step) => (
              <div key={step.label} className="flex items-baseline justify-between gap-3">
                <span className={`${step.className} truncate`}>Departamento en Palermo</span>
                <span className="shrink-0 text-xs text-muted-foreground">{step.label}</span>
              </div>
            ))}
            <p className="font-display text-2xl font-semibold tabular-nums">US$ 185.000</p>
          </div>
        </SectionCard>

        <SectionCard title="Botones">
          <div className="flex flex-col gap-4">
            <Row title="Variantes">
              <Button>Primario</Button>
              <Button variant="secondary">Secundario</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
              <Button variant="destructive">Eliminar</Button>
            </Row>
            <Row title="Tamaños">
              <Button size="sm">
                <PlusIcon className="h-4 w-4" />
                Nueva propiedad
              </Button>
              <Button>Default</Button>
              <Button size="lg">Grande</Button>
              <Button size="icon-sm" variant="ghost" aria-label="Editar">
                <PencilIcon />
              </Button>
              <Button size="icon" variant="outline" aria-label="Buscar">
                <SearchIcon />
              </Button>
            </Row>
            <Row title="Estados">
              <Button
                disabled={saving}
                onClick={() => {
                  setSaving(true);
                  setTimeout(() => {
                    setSaving(false);
                  }, 1500);
                }}
              >
                {saving && <Loader2Icon className="h-4 w-4 animate-spin" />}
                Guardar
              </Button>
              <Button disabled variant="outline">
                Deshabilitado
              </Button>
            </Row>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Campos">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="demo-title">Título</Label>
            <Input id="demo-title" placeholder="Depto. 3 amb. con balcón" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="demo-invalid">Con error</Label>
            <Input id="demo-invalid" aria-invalid defaultValue="no es un email" />
            <p className="text-sm leading-normal text-destructive">Ingresá un email válido.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="demo-operation">Operación</Label>
            <Select defaultValue="sale">
              <SelectTrigger id="demo-operation" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sale">Venta</SelectItem>
                <SelectItem value="rent">Alquiler</SelectItem>
                <SelectItem value="temporary_rent">Alquiler temporario</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="demo-password">Contraseña</Label>
            <PasswordInput id="demo-password" defaultValue="norde-2026" />
          </div>
          <div className="grid gap-2">
            <Label>Propiedad (catálogo paginado)</Label>
            <PagedCombobox
              value={property}
              onChange={setProperty}
              loadPage={loadDemoProperties}
              placeholder="Elegí una propiedad"
              searchPlaceholder="Buscar por título o código"
            />
          </div>
          <div className="grid gap-2">
            <Label>Propiedades (selección múltiple)</Label>
            <PagedMultiSelect
              value={properties}
              onChange={setProperties}
              loadPage={loadDemoProperties}
              searchPlaceholder="Buscar por título o código"
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="demo-description">Descripción</Label>
            <Textarea id="demo-description" placeholder="Luminoso, con balcón al frente…" />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="demo-featured" defaultChecked />
            <Label htmlFor="demo-featured" className="font-normal">
              Destacada en la web
            </Label>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="grid gap-1">
              <Label htmlFor="demo-portals">Publicar en portales</Label>
              <p className="text-sm leading-normal text-muted-foreground">
                Zonaprop, Argenprop y Mercado Libre.
              </p>
            </div>
            <Switch id="demo-portals" defaultChecked />
          </div>
          <div className="flex flex-col gap-3 sm:col-span-2">
            <FileDropzone
              multiple
              hint="PDF o imágenes, hasta 10 MB cada uno."
              onFiles={(selected) => {
                setFiles((current) => [...current, ...selected.map((file) => file.name)]);
              }}
            />
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map((name, index) => (
                  <FileChip
                    key={`${name}-${String(index)}`}
                    name={name}
                    onRemove={() => {
                      setFiles((current) => current.filter((_, position) => position !== index));
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Estados">
          <div className="flex flex-col gap-4">
            <Row title="StatusPill (entidades de negocio)">
              <StatusPill tone="green">Publicada</StatusPill>
              <StatusPill tone="amber">Reservada</StatusPill>
              <StatusPill tone="red">Vencido</StatusPill>
              <StatusPill tone="gray">Pausada</StatusPill>
            </Row>
            <Row title="Badge (tablas administrativas)">
              <Badge variant="success">Activo</Badge>
              <Badge variant="secondary">Inactivo</Badge>
              <Badge variant="warning">Pendiente</Badge>
              <Badge variant="info">Nuevo</Badge>
              <Badge>Marca</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="destructive">Error</Badge>
            </Row>
            <Row title="SoftBadge">
              <SoftBadge>Mensual</SoftBadge>
              <SoftBadge>Trimestral</SoftBadge>
              <SoftBadge>12</SoftBadge>
            </Row>
          </div>
        </SectionCard>

        <SectionCard title="Pestañas">
          <Tabs defaultValue="data">
            <TabsList>
              <TabsTrigger value="data">Datos</TabsTrigger>
              <TabsTrigger value="photos">Fotos</TabsTrigger>
              <TabsTrigger value="portals">Portales</TabsTrigger>
              <TabsTrigger value="history">Historial</TabsTrigger>
            </TabsList>
            <TabsContent value="data">
              <p className="text-sm text-muted-foreground">
                La pestaña activa se invierte: fondo de tinta, texto de papel.
              </p>
            </TabsContent>
            <TabsContent value="photos">
              <p className="text-sm text-muted-foreground">12 fotos cargadas.</p>
            </TabsContent>
            <TabsContent value="portals">
              <p className="text-sm text-muted-foreground">Publicada en 3 portales.</p>
            </TabsContent>
            <TabsContent value="history">
              <p className="text-sm text-muted-foreground">Sin cambios recientes.</p>
            </TabsContent>
          </Tabs>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Overlays">
          <div className="flex flex-wrap items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Qué es la tasación">
                  <InfoIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Valor estimado de mercado</TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Más acciones">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuLabel>Propiedad</DropdownMenuLabel>
                <DropdownMenuItem>
                  <PencilIcon />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">
                  <Trash2Icon />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">Popover</Button>
              </PopoverTrigger>
              <PopoverContent>
                <p className="text-sm leading-normal">
                  Contenido flotante con borde y sombra media.
                </p>
              </PopoverContent>
            </Popover>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive">Eliminar propiedad</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>¿Eliminar propiedad?</DialogTitle>
                  <DialogDescription>
                    «Depto. 3 amb. con balcón» (N-0142) va a la papelera y se despublica de los
                    portales. La podés restaurar desde la papelera.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline">Cancelar</Button>
                  <Button variant="destructive">Eliminar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </SectionCard>

        <SectionCard title="Toasts">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => toast.success('Propiedad guardada')}>
              Éxito
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast.error('No pudimos publicar en Zonaprop', {
                  description: 'El portal no respondió. Probá de nuevo en unos minutos.',
                })
              }
            >
              Error
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast('Contacto archivado', {
                  action: { label: 'Deshacer', onClick: () => undefined },
                })
              }
            >
              Con acción
            </Button>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Carga">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="skeleton-sweep h-10 w-full" />
        </div>
      </SectionCard>
    </div>
  );
}
