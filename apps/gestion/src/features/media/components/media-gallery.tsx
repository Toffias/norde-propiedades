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
  type MediaOwnerInput,
  type MediaRotationValue,
  type MediaRow,
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
  ImageIcon,
  ImageOffIcon,
  ImagesIcon,
  Loader2Icon,
  MoreVerticalIcon,
  PlayCircleIcon,
  RotateCwIcon,
  Trash2Icon,
  VideoIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from 'react';

import { runAction, type ActionResult } from '../../../lib/action-result';
import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import {
  addMediaLinkAction,
  deleteMediaAction,
  reorderMediaAction,
  setMediaCoverAction,
  updateMediaAction,
  uploadMediaAction,
} from '../actions';
import { mediaFileHref } from '../paths';
import { MEDIA_KIND_LABELS } from '../labels';
import { FallbackImage } from '../../properties/components/property-photo';
import { ConfirmActionDialog } from '../../shared/components/confirm-action-dialog';

/** Fotos que se suben a la vez: el resto espera su turno. */
const UPLOAD_CONCURRENCY = 3;
/** Cada cuánto se vuelve a pedir la galería mientras hay fotos procesándose. */
const REFRESH_MS = 4000;

const ROTATIONS: readonly MediaRotationValue[] = [0, 90, 180, 270];

function nextRotation(rotation: MediaRotationValue): MediaRotationValue {
  return ROTATIONS[(ROTATIONS.indexOf(rotation) + 1) % ROTATIONS.length] ?? 0;
}

function isImage(item: MediaRow): boolean {
  return item.kind === 'photo' || item.kind === 'floor_plan';
}

/**
 * Una foto elegida para subir. Se ve como una tarjeta más de la galería, con la vista previa del
 * navegador, hasta que llega la del servidor (`mediaId`); después le presta la vista previa
 * mientras se generan sus variantes, para que la imagen no salte.
 */
interface Upload {
  readonly key: string;
  readonly file: File;
  /** `URL.createObjectURL(file)`: se libera cuando ya no hace falta. */
  readonly preview: string;
  readonly status: 'waiting' | 'uploading' | 'uploaded' | 'failed';
  readonly mediaId?: string;
  readonly error?: string;
}

/** Cuándo la tarjeta del servidor ya no necesita la vista previa local. */
function hasOwnImage(item: MediaRow): boolean {
  return item.hasThumbnail || item.processing === 'failed';
}

/**
 * Las fotos elegidas y su subida (de a `UPLOAD_CONCURRENCY`), con reintentar y quitar. Libera
 * cada vista previa cuando la tarjeta del servidor ya muestra su miniatura, y todas al salir.
 */
function useUploads(owner: MediaOwnerInput, items: readonly MediaRow[]) {
  const router = useRouter();
  const [uploads, setUploads] = useState<readonly Upload[]>([]);
  const previews = useRef(new Map<string, string>());

  const settled = new Set(items.filter(hasOwnImage).map((item) => item.id));
  const isSettled = (upload: Upload) => upload.mediaId !== undefined && settled.has(upload.mediaId);

  useEffect(() => {
    for (const upload of uploads) {
      if (!isSettled(upload) || !previews.current.has(upload.key)) continue;
      URL.revokeObjectURL(upload.preview);
      previews.current.delete(upload.key);
    }
  });

  useEffect(() => {
    const open = previews.current;
    return () => {
      for (const url of open.values()) URL.revokeObjectURL(url);
      open.clear();
    };
  }, []);

  const update = (key: string, change: Partial<Upload>) => {
    setUploads((current) =>
      current.map((upload) => (upload.key === key ? { ...upload, ...change } : upload)),
    );
  };

  function run(queue: Upload[]) {
    const worker = async () => {
      for (;;) {
        const next = queue.shift();
        if (next === undefined) return;
        update(next.key, { status: 'uploading' });
        const form = new FormData();
        form.set('ownerKind', owner.kind);
        form.set('ownerId', owner.id);
        form.set('file', next.file);
        try {
          const result = await uploadMediaAction(form);
          update(
            next.key,
            result.ok
              ? { status: 'uploaded', mediaId: result.mediaId }
              : { status: 'failed', error: result.message },
          );
        } catch {
          update(next.key, { status: 'failed', error: UNEXPECTED_ERROR_MESSAGE });
        }
      }
    };
    void Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker)).then(() => {
      router.refresh();
    });
  }

  return {
    /** Las que todavía no tienen su tarjeta del servidor con miniatura, en el orden elegido. */
    pending: uploads.filter((upload) => !isSettled(upload)),
    previewFor: (mediaId: string) =>
      uploads.find((upload) => upload.mediaId === mediaId && !isSettled(upload))?.preview,
    add(files: readonly File[]) {
      const stamp = Date.now().toString();
      const added = files.map((file, index) => {
        const preview = URL.createObjectURL(file);
        const key = `${stamp}-${index.toString()}`;
        previews.current.set(key, preview);
        return { key, file, preview, status: 'waiting' as const };
      });
      setUploads((current) => [...current.filter((upload) => !isSettled(upload)), ...added]);
      run([...added]);
    },
    retry(upload: Upload) {
      const again: Upload = { ...upload, status: 'waiting' };
      setUploads((current) => current.map((item) => (item.key === upload.key ? again : item)));
      run([again]);
    },
    remove(upload: Upload) {
      URL.revokeObjectURL(upload.preview);
      previews.current.delete(upload.key);
      setUploads((current) => current.filter((item) => item.key !== upload.key));
    },
  };
}

/**
 * La pestaña Multimedia: subir varias fotos (con su avance), ordenar arrastrando, elegir la portada
 * y, por foto, mostrar en la web, incluir en el PDF, marcar como plano, rotar, describir, bajar o
 * borrar. Más los videos y recorridos 360 por link.
 */
export function MediaGallery({
  owner,
  items,
  canEdit,
}: {
  readonly owner: MediaOwnerInput;
  readonly items: readonly MediaRow[];
  readonly canEdit: boolean;
}) {
  const router = useRouter();
  // El orden recién arrastrado vale hasta que el servidor manda la galería actualizada.
  const [dragged, setDragged] = useState<{
    readonly source: readonly MediaRow[];
    readonly order: readonly MediaRow[];
  }>();
  const order = dragged?.source === items ? dragged.order : items;
  const setOrder = (next: readonly MediaRow[]) => {
    setDragged({ source: items, order: next });
  };
  const uploads = useUploads(owner, items);
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
  // Las tarjetas locales van al final, donde queda una foto nueva, hasta que llega la del
  // servidor (que sigue con la vista previa local mientras no tiene miniatura).
  const arrived = new Set(images.map((item) => item.id));
  const local = uploads.pending.filter(
    (upload) => upload.mediaId === undefined || !arrived.has(upload.mediaId),
  );
  const links = order.filter((item) => !isImage(item));

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
        reorderMediaAction({ owner, mediaIds: next.map((item) => item.id) }),
      );
      if (error !== undefined) {
        toast.error(error);
        setOrder(items);
      }
    });
  }

  const tooBig = (file: File) => file.size > MAX_MEDIA_UPLOAD_BYTES;
  const allowed = (file: File) =>
    MEDIA_IMAGE_CONTENT_TYPES.some((type) => type === file.type) && file.size > 0 && !tooBig(file);

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title={`Fotos y planos (${images.length.toString()})`} icon={ImagesIcon}>
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
                if (accepted.length > 0) uploads.add(accepted);
              }}
            />
          )}
          {images.length === 0 && local.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay fotos.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={images.map((item) => item.id)} strategy={rectSortingStrategy}>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {images.map((item) => (
                    <MediaTile
                      key={item.id}
                      owner={owner}
                      item={item}
                      canEdit={canEdit}
                      preview={uploads.previewFor(item.id)}
                    />
                  ))}
                  {local.map((upload) => (
                    <UploadTile
                      key={upload.key}
                      upload={upload}
                      onRetry={() => {
                        uploads.retry(upload);
                      }}
                      onRemove={() => {
                        uploads.remove(upload);
                      }}
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

      <SectionCard title="Videos y recorridos 360" icon={VideoIcon}>
        <MediaLinks owner={owner} links={links} canEdit={canEdit} />
      </SectionCard>
    </div>
  );
}

function MediaTile({
  owner,
  item,
  canEdit,
  preview,
}: {
  readonly owner: MediaOwnerInput;
  readonly item: MediaRow;
  readonly canEdit: boolean;
  /** La vista previa local de una foto recién subida, hasta que tiene su miniatura. */
  readonly preview: string | undefined;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canEdit,
  });
  const [pending, startTransition] = useTransition();
  const [describing, setDescribing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const run = (action: () => Promise<ActionResult>, done: string) => {
    startTransition(async () => {
      const error = await runAction(action);
      if (error === undefined) toast.success(done);
      else toast.error(error);
    });
  };
  const update = (change: Parameters<typeof updateMediaAction>[1], done: string) => {
    run(() => updateMediaAction(owner, change), done);
  };
  const src = mediaFileHref(owner, item.id);
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
          <TilePlaceholder icon={ImageOffIcon} tone="error">
            No se pudo procesar
          </TilePlaceholder>
        ) : preview !== undefined && !item.hasThumbnail ? (
          <LocalPreview src={preview} alt={item.description ?? MEDIA_KIND_LABELS[item.kind]} />
        ) : (
          <FallbackImage
            key={`${src}-${version}`}
            src={`${src}?v=${item.hasThumbnail ? 'thumbnail' : 'original'}&r=${version}`}
            alt={item.description ?? MEDIA_KIND_LABELS[item.kind]}
            className="h-full w-full object-cover"
            {...(item.hasThumbnail
              ? {}
              : { style: { transform: `rotate(${item.rotation.toString()}deg)` } })}
            fallback={
              item.processing === 'pending' ? (
                <TilePlaceholder icon={ImageIcon}>Preparando la vista previa…</TilePlaceholder>
              ) : (
                <TilePlaceholder icon={ImageOffIcon}>Sin vista previa</TilePlaceholder>
              )
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
            {/* Ya está subida: lo que falta son la miniatura, la versión web y la marca de agua. */}
            Generando variantes
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
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Acciones de la foto"
              disabled={pending}
            >
              {pending ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <MoreVerticalIcon className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {canEdit && (
              <>
                <DropdownMenuItem
                  disabled={item.isCover || item.kind !== 'photo'}
                  onSelect={() => {
                    run(() => setMediaCoverAction(owner, { mediaId: item.id }), 'Portada elegida.');
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
                      'Rotada. Se están generando sus variantes de nuevo.',
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
        run={() => deleteMediaAction(owner, { mediaId: item.id })}
        onOpenChange={setDeleting}
      />
    </li>
  );
}

/** La vista previa del navegador (`blob:`) de una foto recién elegida. */
function LocalPreview({
  src,
  alt,
  className,
}: {
  readonly src: string;
  readonly alt: string;
  readonly className?: string;
}) {
  // eslint-disable-next-line @next/next/no-img-element -- una URL `blob:` local: `next/image` no la optimiza.
  return <img src={src} alt={alt} className={cn('h-full w-full object-cover', className)} />;
}

const UPLOAD_STATUS_LABELS: Readonly<Record<Upload['status'], string>> = {
  waiting: 'En espera',
  uploading: 'Subiendo…',
  // Ya está en el servidor: falta que llegue su tarjeta, que dice lo mismo.
  uploaded: 'Generando variantes',
  failed: 'No se pudo subir',
};

/** Una foto elegida que todavía no tiene su tarjeta del servidor, en el lugar donde va a quedar. */
function UploadTile({
  upload,
  onRetry,
  onRemove,
}: {
  readonly upload: Upload;
  readonly onRetry: () => void;
  readonly onRemove: () => void;
}) {
  const failed = upload.status === 'failed';
  const label = UPLOAD_STATUS_LABELS[upload.status];
  return (
    <li
      className={cn(
        'relative overflow-hidden rounded-lg border bg-muted',
        failed ? 'border-destructive/60' : 'border-border',
      )}
      aria-label={`${upload.file.name}: ${label}`}
    >
      <div className="aspect-[4/3] w-full">
        <LocalPreview
          src={upload.preview}
          alt={upload.file.name}
          className={cn(failed && 'opacity-40')}
        />
      </div>
      <div className="absolute inset-x-0 top-0 flex flex-wrap gap-1 p-1.5" aria-live="polite">
        {failed ? (
          <Badge variant="destructive">{label}</Badge>
        ) : (
          <Badge variant="secondary">
            <Loader2Icon className="h-3 w-3 animate-spin" />
            {label}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1 p-1.5">
        <p
          className={cn(
            'min-w-0 flex-1 py-1.5 text-xs',
            failed ? 'line-clamp-2' : 'truncate',
            failed ? 'text-destructive' : 'text-muted-foreground',
          )}
          title={failed ? upload.error : upload.file.name}
        >
          {failed ? upload.error : upload.file.name}
        </p>
        {failed && (
          <>
            <Button size="icon-sm" variant="ghost" aria-label="Reintentar" onClick={onRetry}>
              <RotateCwIcon className="h-4 w-4" />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Quitar" onClick={onRemove}>
              <XIcon className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

/** Lo que ocupa el lugar de la foto cuando no hay imagen para mostrar. */
function TilePlaceholder({
  icon: Icon,
  tone = 'muted',
  children,
}: {
  readonly icon: LucideIcon;
  readonly tone?: 'muted' | 'error';
  readonly children: ReactNode;
}) {
  return (
    // Bajado media franja de acciones: así queda centrado en toda la tarjeta, no solo en la foto.
    <div
      className={cn(
        'flex h-full translate-y-7 flex-col items-center justify-center gap-2 p-3 text-center text-xs',
        tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-full',
          tone === 'error' ? 'bg-destructive/10' : 'bg-background/70',
        )}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      {children}
    </div>
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
  owner,
  links,
  canEdit,
}: {
  readonly owner: MediaOwnerInput;
  readonly links: readonly MediaRow[];
  readonly canEdit: boolean;
}) {
  const id = useId();
  const [kind, setKind] = useState<'video' | 'tour_360'>('video');
  const [url, setUrl] = useState('');
  const [deleting, setDeleting] = useState<MediaRow | undefined>();
  const [pending, startTransition] = useTransition();

  function add() {
    startTransition(async () => {
      const error = await runAction(() => addMediaLinkAction({ owner, kind, url: url.trim() }));
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
        run={() => deleteMediaAction(owner, { mediaId: deleting?.id ?? '' })}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined);
        }}
      />
    </div>
  );
}
