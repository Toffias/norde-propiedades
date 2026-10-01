'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  MAX_MEDIA_UPLOAD_BYTES,
  MEDIA_IMAGE_CONTENT_TYPES,
  type MediaRotationValue,
  type PropertyMediaRow,
} from '@norde/core/properties/contracts';
import { Badge } from '@norde/ui/components/badge';
import { Button } from '@norde/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@norde/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@norde/ui/components/dropdown-menu';
import { FileDropzone } from '@norde/ui/components/file-dropzone';
import { Input } from '@norde/ui/components/input';
import { Label } from '@norde/ui/components/label';
import { SectionCard } from '@norde/ui/components/section-card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { toast } from '@norde/ui/components/sonner';
import { Textarea } from '@norde/ui/components/textarea';
import { cn } from '@norde/ui/lib/utils';
import {
  ExternalLinkIcon,
  GripVerticalIcon,
  ImageOffIcon,
  Loader2Icon,
  MoreVerticalIcon,
  PlayCircleIcon,
  Trash2Icon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, useTransition } from 'react';

import { runAction, type ActionResult } from '../../../../lib/action-result';
import {
  addPropertyMediaLinkAction,
  deletePropertyMediaAction,
  reorderPropertyMediaAction,
  setPropertyCoverAction,
  updatePropertyMediaAction,
  uploadPropertyMediaAction,
} from '../../detail-actions';
import { MEDIA_KIND_LABELS } from '../../detail-labels';
import { ConfirmActionDialog } from '../../../shared/components/confirm-action-dialog';

/** Fotos que se suben a la vez: el resto espera su turno. */
const UPLOAD_CONCURRENCY = 3;
/** Cada cuánto se vuelve a pedir la galería mientras hay fotos procesándose. */
const REFRESH_MS = 4000;

const ROTATIONS: readonly MediaRotationValue[] = [0, 90, 180, 270];

function nextRotation(rotation: MediaRotationValue): MediaRotationValue {
  return ROTATIONS[(ROTATIONS.indexOf(rotation) + 1) % ROTATIONS.length] ?? 0;
}

function isImage(item: PropertyMediaRow): boolean {
  return item.kind === 'photo' || item.kind === 'floor_plan';
}

interface Upload {
  readonly key: string;
  readonly name: string;
  readonly status: 'waiting' | 'uploading' | 'done' | 'failed';
  readonly error?: string;
}

/**
 * La pestaña Multimedia: subir varias fotos (con su avance), ordenar arrastrando, elegir la portada
 * y, por foto, mostrar en la web, incluir en el PDF, marcar como plano, rotar, describir, bajar o
 * borrar. Más los videos y recorridos 360 por link.
 */
export function MediaGallery({
  propertyId,
  items,
  canEdit,
}: {
  readonly propertyId: string;
  readonly items: readonly PropertyMediaRow[];
  readonly canEdit: boolean;
}) {
  const router = useRouter();
  // El orden recién arrastrado vale hasta que el servidor manda la galería actualizada.
  const [dragged, setDragged] = useState<{
    readonly source: readonly PropertyMediaRow[];
    readonly order: readonly PropertyMediaRow[];
  }>();
  const order = dragged?.source === items ? dragged.order : items;
  const setOrder = (next: readonly PropertyMediaRow[]) => {
    setDragged({ source: items, order: next });
  };
  const [uploads, setUploads] = useState<readonly Upload[]>([]);
  const [, startTransition] = useTransition();
  const processing = items.some((item) => item.processing === 'pending');

  useEffect(() => {
    if (!processing) return undefined;
    const timer = setInterval(() => {
      router.refresh();
    }, REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [processing, router]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const images = order.filter(isImage);
  const links = order.filter((item) => !isImage(item));

  function upload(files: readonly File[]) {
    const queue = files.map((file, index) => ({
      key: `${Date.now().toString()}-${index.toString()}`,
      file,
    }));
    setUploads((current) => [
      ...current.filter((upload) => upload.status !== 'done'),
      ...queue.map(({ key, file }) => ({ key, name: file.name, status: 'waiting' as const })),
    ]);
    const update = (key: string, change: Partial<Upload>) => {
      setUploads((current) =>
        current.map((upload) => (upload.key === key ? { ...upload, ...change } : upload)),
      );
    };
    const worker = async () => {
      for (;;) {
        const next = queue.shift();
        if (next === undefined) return;
        update(next.key, { status: 'uploading' });
        const form = new FormData();
        form.set('propertyId', propertyId);
        form.set('file', next.file);
        const error = await runAction(() => uploadPropertyMediaAction(form));
        update(next.key, error === undefined ? { status: 'done' } : { status: 'failed', error });
      }
    };
    void Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker)).then(() => {
      router.refresh();
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over === null || active.id === over.id) return;
    const from = images.findIndex((item) => item.id === active.id);
    const to = images.findIndex((item) => item.id === over.id);
    if (from < 0 || to < 0) return;
    const next = [...arrayMove([...images], from, to), ...links];
    setOrder(next);
    startTransition(async () => {
      const error = await runAction(() =>
        reorderPropertyMediaAction({ propertyId, mediaIds: next.map((item) => item.id) }),
      );
      if (error !== undefined) {
        toast.error(error);
        setOrder(items);
      }
    });
  }

  const tooBig = (file: File) => file.size > MAX_MEDIA_UPLOAD_BYTES;
  const allowed = (file: File) =>
    MEDIA_IMAGE_CONTENT_TYPES.some((type) => type === file.type) && !tooBig(file);

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title={`Fotos y planos (${images.length.toString()})`}>
        <div className="flex flex-col gap-4">
          {canEdit && (
            <FileDropzone
              multiple
              accept={MEDIA_IMAGE_CONTENT_TYPES.join(',')}
              title="Arrastrá las fotos o hacé clic para elegirlas"
              hint="JPG, PNG o WebP, hasta 15 MB cada una. La original se guarda tal cual."
              onFiles={(files) => {
                const rejected = files.filter((file) => !allowed(file));
                if (rejected.length > 0) {
                  toast.error(
                    `No se suben ${rejected.length.toString()} archivos: tienen que ser fotos JPG, PNG o WebP de hasta 15 MB.`,
                  );
                }
                const accepted = files.filter(allowed);
                if (accepted.length > 0) upload(accepted);
              }}
            />
          )}
          {uploads.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm" aria-live="polite">
              {uploads.map((item) => (
                <li key={item.key} className="flex items-center gap-2">
                  {item.status === 'uploading' || item.status === 'waiting' ? (
                    <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : null}
                  <span className="truncate">{item.name}</span>
                  <span
                    className={cn(
                      'text-xs',
                      item.status === 'failed' ? 'text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {item.status === 'waiting'
                      ? 'En espera'
                      : item.status === 'uploading'
                        ? 'Subiendo…'
                        : item.status === 'done'
                          ? 'Subida'
                          : item.error}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {images.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay fotos.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={images.map((item) => item.id)} strategy={rectSortingStrategy}>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {images.map((item) => (
                    <MediaTile
                      key={item.id}
                      propertyId={propertyId}
                      item={item}
                      canEdit={canEdit}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
          {canEdit && images.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Arrastrá las fotos para cambiar el orden: la primera es la que se ve primero en la
              web.
            </p>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Videos y recorridos 360">
        <MediaLinks propertyId={propertyId} links={links} canEdit={canEdit} />
      </SectionCard>
    </div>
  );
}

function MediaTile({
  propertyId,
  item,
  canEdit,
}: {
  readonly propertyId: string;
  readonly item: PropertyMediaRow;
  readonly canEdit: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canEdit,
  });
  const [, startTransition] = useTransition();
  const [describing, setDescribing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const run = (action: () => Promise<ActionResult>, done: string) => {
    startTransition(async () => {
      const error = await runAction(action);
      if (error === undefined) toast.success(done);
      else toast.error(error);
    });
  };
  const update = (change: Parameters<typeof updatePropertyMediaAction>[1], done: string) => {
    run(() => updatePropertyMediaAction(propertyId, change), done);
  };
  const src = `/propiedades/${propertyId}/fotos/${item.id}`;
  // La versión en la URL cambia al regenerarse las variantes: evita mostrar la de la caché.
  const version = `${item.processing}-${item.rotation.toString()}`;

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        'group relative overflow-hidden rounded-lg border border-border bg-muted',
        isDragging && 'z-10 opacity-80 shadow-lg',
      )}
    >
      <div className="aspect-[4/3] w-full">
        {item.processing === 'failed' ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-destructive">
            <ImageOffIcon className="h-6 w-6" />
            No se pudo procesar
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- la sirve una ruta autorizada del panel
          <img
            src={`${src}?v=${item.hasThumbnail ? 'thumbnail' : 'original'}&r=${version}`}
            alt={item.description ?? MEDIA_KIND_LABELS[item.kind]}
            loading="lazy"
            className="h-full w-full object-cover"
            style={
              item.hasThumbnail
                ? undefined
                : { transform: `rotate(${item.rotation.toString()}deg)` }
            }
          />
        )}
      </div>
      <div className="absolute inset-x-0 top-0 flex flex-wrap gap-1 p-1.5">
        {item.isCover && <Badge>Portada</Badge>}
        {item.kind === 'floor_plan' && <Badge variant="secondary">Plano</Badge>}
        {!item.showOnWeb && <Badge variant="secondary">Oculta en la web</Badge>}
        {!item.includeInPdf && <Badge variant="secondary">Fuera del PDF</Badge>}
        {item.processing === 'pending' && (
          <Badge variant="secondary">
            <Loader2Icon className="h-3 w-3 animate-spin" />
            Procesando
          </Badge>
        )}
      </div>
      <div className="flex items-center justify-between gap-1 p-1.5">
        {canEdit ? (
          <button
            type="button"
            className="cursor-grab rounded p-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
            aria-label="Arrastrar para ordenar"
            {...attributes}
            {...listeners}
          >
            <GripVerticalIcon className="h-4 w-4" />
          </button>
        ) : (
          <span />
        )}
        <p
          className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
          title={item.description}
        >
          {item.description ?? ''}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label="Acciones de la foto">
              <MoreVerticalIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {canEdit && (
              <>
                <DropdownMenuItem
                  disabled={item.isCover || item.kind !== 'photo'}
                  onSelect={() => {
                    run(
                      () => setPropertyCoverAction(propertyId, { mediaId: item.id }),
                      'Portada elegida.',
                    );
                  }}
                >
                  Usar como portada
                </DropdownMenuItem>
                <DropdownMenuCheckboxItem
                  checked={item.showOnWeb}
                  onCheckedChange={(checked) => {
                    update({ mediaId: item.id, showOnWeb: checked }, 'Foto actualizada.');
                  }}
                >
                  Mostrar en la web
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={item.includeInPdf}
                  onCheckedChange={(checked) => {
                    update({ mediaId: item.id, includeInPdf: checked }, 'Foto actualizada.');
                  }}
                >
                  Incluir en el PDF
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={item.kind === 'floor_plan'}
                  onCheckedChange={(checked) => {
                    update({ mediaId: item.id, isFloorPlan: checked }, 'Foto actualizada.');
                  }}
                >
                  Es un plano
                </DropdownMenuCheckboxItem>
                <DropdownMenuItem
                  onSelect={() => {
                    update(
                      { mediaId: item.id, rotation: nextRotation(item.rotation) },
                      'Rotada. Se está procesando de nuevo.',
                    );
                  }}
                >
                  Rotar 90°
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setDescribing(true);
                  }}
                >
                  Descripción…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem asChild>
              <a href={`${src}?v=original`} download>
                Descargar la original
              </a>
            </DropdownMenuItem>
            {canEdit && (
              <DropdownMenuItem
                className="text-destructive"
                onSelect={() => {
                  setDeleting(true);
                }}
              >
                Borrar
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {describing && (
        <DescriptionDialog
          initial={item.description ?? ''}
          onClose={() => {
            setDescribing(false);
          }}
          onSave={(description) => {
            setDescribing(false);
            update({ mediaId: item.id, description }, 'Descripción guardada.');
          }}
        />
      )}
      <ConfirmActionDialog
        copy={
          deleting
            ? {
                title: 'Borrar la foto',
                description: item.isCover
                  ? 'Es la portada: la reemplaza la siguiente foto. No se puede deshacer.'
                  : 'Se borra la foto y sus versiones. No se puede deshacer.',
                confirm: 'Borrar',
                done: 'Foto borrada.',
                destructive: true,
              }
            : undefined
        }
        run={() => deletePropertyMediaAction(propertyId, { mediaId: item.id })}
        onOpenChange={setDeleting}
      />
    </li>
  );
}

function DescriptionDialog({
  initial,
  onClose,
  onSave,
}: {
  readonly initial: string;
  readonly onClose: () => void;
  readonly onSave: (description: string) => void;
}) {
  const id = useId();
  const [description, setDescription] = useState(initial);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Descripción de la foto</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>Descripción</Label>
          <Textarea
            id={id}
            rows={3}
            maxLength={300}
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onSave(description.trim());
            }}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MediaLinks({
  propertyId,
  links,
  canEdit,
}: {
  readonly propertyId: string;
  readonly links: readonly PropertyMediaRow[];
  readonly canEdit: boolean;
}) {
  const id = useId();
  const [kind, setKind] = useState<'video' | 'tour_360'>('video');
  const [url, setUrl] = useState('');
  const [deleting, setDeleting] = useState<PropertyMediaRow | undefined>();
  const [pending, startTransition] = useTransition();

  function add() {
    startTransition(async () => {
      const error = await runAction(() =>
        addPropertyMediaLinkAction({ propertyId, kind, url: url.trim() }),
      );
      if (error !== undefined) {
        toast.error(error);
        return;
      }
      setUrl('');
      toast.success(`${MEDIA_KIND_LABELS[kind]} agregado.`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin videos ni recorridos.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {links.map((link) => (
            <li key={link.id} className="flex items-center gap-3 py-2">
              <PlayCircleIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{MEDIA_KIND_LABELS[link.kind]}</p>
                <a
                  href={link.externalUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex max-w-full items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground"
                >
                  <span className="truncate">{link.externalUrl}</span>
                  <ExternalLinkIcon className="h-3 w-3 shrink-0" />
                </a>
              </div>
              {canEdit && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Quitar el ${MEDIA_KIND_LABELS[link.kind].toLowerCase()}`}
                  onClick={() => {
                    setDeleting(link);
                  }}
                >
                  <Trash2Icon className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form
          className="grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-kind`}>Tipo</Label>
            <Select
              value={kind}
              onValueChange={(value) => {
                setKind(value === 'tour_360' ? 'tour_360' : 'video');
              }}
            >
              <SelectTrigger id={`${id}-kind`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="video">Video (YouTube, Vimeo)</SelectItem>
                <SelectItem value="tour_360">Recorrido 360 (Matterport, Kuula)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-url`}>Link</Label>
            <Input
              id={`${id}-url`}
              type="url"
              placeholder="https://"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
              }}
            />
          </div>
          <Button type="submit" disabled={pending || url.trim() === ''}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Agregar
          </Button>
        </form>
      )}
      <ConfirmActionDialog
        copy={
          deleting === undefined
            ? undefined
            : {
                title: `Quitar el ${MEDIA_KIND_LABELS[deleting.kind].toLowerCase()}`,
                description: 'Se quita el link de la ficha.',
                confirm: 'Quitar',
                done: 'Link quitado.',
                destructive: true,
              }
        }
        run={() => deletePropertyMediaAction(propertyId, { mediaId: deleting?.id ?? '' })}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined);
        }}
      />
    </div>
  );
}
