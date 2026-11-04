'use client';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@norde/ui/components/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@norde/ui/components/tabs';
import { WhatsAppIcon } from '@norde/ui/components/whatsapp-icon';
import { cn } from '@norde/ui/lib/utils';
import {
  Bath,
  BedDouble,
  Building2,
  CalendarCheck,
  Car,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  Grid2X2,
  House,
  type LucideIcon,
  MapPin,
  Ruler,
} from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

import { isExternal } from '../../lib/properties/images';
import type { ListingFactKind, ListingImage } from '../../lib/properties/view';
import { SkeletonImage } from '../layout/skeleton-image';

/** Un dato principal de la unidad o del emprendimiento para el costado de "todas las fotos". */
export interface GalleryHighlight {
  readonly kind: ListingFactKind | 'delivery' | 'units';
  readonly label: string;
}

const HIGHLIGHT_ICONS: Record<GalleryHighlight['kind'], LucideIcon> = {
  surface: Ruler,
  rooms: DoorOpen,
  bedrooms: BedDouble,
  bathrooms: Bath,
  parking: Car,
  delivery: CalendarCheck,
  units: Building2,
};

/**
 * Ancho de cada foto del mosaico (4 columnas × 2 filas) según cuántas hay, para que nunca quede
 * un hueco: la portada ocupa la mitad y las demás reparten la otra mitad.
 */
function tileSpan(index: number, count: number): string {
  if (index === 0) return count === 1 ? 'sm:col-span-4' : 'sm:col-span-2';
  if (count === 2) return 'sm:col-span-2 sm:row-span-2';
  if (count === 3 || (count === 4 && index === 1)) return 'sm:col-span-2';
  return '';
}

type AllTab = 'photos' | 'plans';

interface PropertyGalleryProps {
  readonly title: string;
  readonly photos: readonly ListingImage[];
  /** Planos: van en su propia pestaña de la vista con todas las fotos. */
  readonly floorPlans?: readonly ListingImage[];
  /** Precio que acompaña al título en la vista con todas las fotos ("US$ 115.000"). */
  readonly priceLabel?: string | null;
  /** Barrio o zona ("Liniers, CABA"), debajo del título. */
  readonly location?: string | null;
  /** Los datos principales (m², ambientes, dormitorios…), para que el costado no quede vacío. */
  readonly highlights?: readonly GalleryHighlight[];
  /** Link a WhatsApp ya armado, o `null` si Norde todavía no tiene el número. */
  readonly whatsappHref?: string | null;
}

/**
 * Galería de la ficha: un mosaico con la portada grande y cuatro fotos más. "Ver las N fotos"
 * abre todas juntas, una debajo de la otra; tocar una foto (del mosaico o de esa vista) la abre en
 * el visor a pantalla completa, que se recorre con flechas o con el teclado. El visor se abre
 * encima de la vista con todas, así al cerrarlo se vuelve al mismo lugar del scroll.
 */
export function PropertyGallery({
  title,
  photos,
  floorPlans = [],
  priceLabel = null,
  location = null,
  highlights = [],
  whatsappHref = null,
}: PropertyGalleryProps) {
  const [allTab, setAllTab] = useState<AllTab | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);

  if (photos.length === 0) {
    return (
      <div className="bg-muted text-muted-foreground flex aspect-[16/9] items-center justify-center rounded-3xl">
        <House aria-hidden className="size-12" />
        <span className="sr-only">Esta propiedad todavía no tiene fotos.</span>
      </div>
    );
  }

  const mosaic = photos.slice(0, 5);

  return (
    <>
      <div className="relative grid aspect-[4/3] gap-2 overflow-hidden rounded-3xl sm:aspect-[16/8] sm:grid-cols-4 sm:grid-rows-2">
        {mosaic.map((photo, index) => (
          <button
            key={photo.src}
            type="button"
            onClick={() => {
              setViewer(index);
            }}
            aria-label={`Ver la foto ${index + 1} de ${photos.length}`}
            className={cn(
              'bg-muted focus-visible:ring-ring/50 relative overflow-hidden outline-none focus-visible:ring-[3px]',
              index === 0 ? 'sm:row-span-2' : 'hidden sm:block',
              tileSpan(index, mosaic.length),
            )}
          >
            <SkeletonImage
              src={photo.src}
              alt={photo.alt}
              fill
              priority={index === 0}
              sizes={index === 0 ? '(min-width: 640px) 50vw, 100vw' : '25vw'}
              unoptimized={isExternal(photo.src)}
              className="object-cover transition-transform duration-500 hover:scale-[1.02]"
            />
          </button>
        ))}
        {(photos.length > 1 || floorPlans.length > 0) && (
          <button
            type="button"
            onClick={() => {
              setAllTab('photos');
            }}
            className="bg-card/95 text-foreground absolute right-3 bottom-3 flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold shadow-md"
          >
            <Grid2X2 aria-hidden className="size-4" />
            Ver las {photos.length} fotos
          </button>
        )}
      </div>

      <AllPhotos
        tab={allTab}
        title={title}
        photos={photos}
        floorPlans={floorPlans}
        priceLabel={priceLabel}
        location={location}
        highlights={highlights}
        whatsappHref={whatsappHref}
        onTabChange={setAllTab}
        onPick={setViewer}
      />

      <PhotoViewer title={title} photos={photos} index={viewer} onIndexChange={setViewer} />
    </>
  );
}

interface AllPhotosProps {
  /** La pestaña abierta, o `null` si la vista está cerrada. */
  readonly tab: AllTab | null;
  readonly title: string;
  readonly photos: readonly ListingImage[];
  readonly floorPlans: readonly ListingImage[];
  readonly priceLabel: string | null;
  readonly location: string | null;
  readonly highlights: readonly GalleryHighlight[];
  readonly whatsappHref: string | null;
  readonly onTabChange: (tab: AllTab | null) => void;
  readonly onPick: (index: number) => void;
}

/**
 * Todas las fotos juntas, una debajo de la otra, a pantalla completa. Al costado (abajo en
 * mobile) quedan el título, el precio, el WhatsApp y los datos principales, para consultar sin
 * volver a la ficha.
 */
function AllPhotos({
  tab,
  title,
  photos,
  floorPlans,
  priceLabel,
  location,
  highlights,
  whatsappHref,
  onTabChange,
  onPick,
}: AllPhotosProps) {
  return (
    <Dialog
      open={tab !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onTabChange(null);
      }}
    >
      <DialogContent className="top-0 left-0 flex h-dvh max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 sm:max-w-none lg:flex-row">
        <Tabs
          value={tab ?? 'photos'}
          onValueChange={(value) => {
            onTabChange(value === 'plans' ? 'plans' : 'photos');
          }}
          className="min-h-0 flex-1 gap-0"
        >
          <div className="border-b px-4 py-3 pr-14 sm:px-6">
            <TabsList aria-label="Qué mirar">
              <TabsTrigger value="photos" className="text-sm">
                Fotos ({photos.length})
              </TabsTrigger>
              {floorPlans.length > 0 && (
                <TabsTrigger value="plans" className="text-sm">
                  Planos ({floorPlans.length})
                </TabsTrigger>
              )}
            </TabsList>
          </div>
          <TabsContent value="photos" className="min-h-0 overflow-y-auto">
            <ImageColumn images={photos} onPick={onPick} />
          </TabsContent>
          {floorPlans.length > 0 && (
            <TabsContent value="plans" className="min-h-0 overflow-y-auto">
              <ImageColumn images={floorPlans} contain />
            </TabsContent>
          )}
        </Tabs>

        <aside className="bg-card flex shrink-0 items-center gap-4 border-t px-4 py-3 sm:px-6 lg:w-96 lg:flex-col lg:items-stretch lg:gap-5 lg:border-t-0 lg:border-l lg:pt-16 lg:pb-6">
          <div className="min-w-0 flex-1 lg:flex-none">
            <DialogTitle className="line-clamp-1 text-sm leading-snug font-bold lg:line-clamp-none lg:text-xl lg:font-extrabold">
              {title}
            </DialogTitle>
            {location && (
              <p className="text-muted-foreground mt-1.5 hidden items-center gap-1.5 text-sm lg:flex">
                <MapPin aria-hidden className="size-4 shrink-0" />
                {location}
              </p>
            )}
            <DialogDescription
              className={cn(
                'text-foreground text-base font-extrabold tracking-tight lg:mt-3 lg:text-2xl',
                priceLabel === null && 'sr-only',
              )}
            >
              {priceLabel ?? `${photos.length} fotos`}
            </DialogDescription>
            {highlights.length > 0 && (
              <p className="text-muted-foreground truncate text-xs lg:hidden">
                {highlights.map((highlight) => highlight.label).join(' · ')}
              </p>
            )}
          </div>
          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Consultar por WhatsApp"
              className="bg-whatsapp flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 lg:h-12"
            >
              <WhatsAppIcon className="size-5" />
              <span aria-hidden className="hidden sm:inline">
                Consultar por WhatsApp
              </span>
            </a>
          )}
          {highlights.length > 0 && (
            <section aria-labelledby="gallery-highlights" className="hidden border-t pt-5 lg:block">
              <h2 id="gallery-highlights" className="text-sm font-bold">
                Características principales
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {highlights.map((highlight) => {
                  const Icon = HIGHLIGHT_ICONS[highlight.kind];
                  return (
                    <li
                      key={highlight.kind}
                      className="bg-background flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold"
                    >
                      <Icon aria-hidden className="text-muted-foreground size-4 shrink-0" />
                      {highlight.label}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </aside>
      </DialogContent>
    </Dialog>
  );
}

/** Las imágenes una debajo de la otra; con `onPick`, tocarlas las abre en el visor. */
function ImageColumn({
  images,
  onPick,
  contain = false,
}: {
  readonly images: readonly ListingImage[];
  readonly onPick?: (index: number) => void;
  readonly contain?: boolean;
}) {
  const sizes = '(min-width: 1024px) 56rem, 100vw';
  return (
    <ul className="mx-auto max-w-4xl space-y-3 p-3 sm:space-y-4 sm:p-6">
      {images.map((image, index) => {
        // Con las medidas se muestra entera, sin recortar; sin ellas, en un marco 4:3.
        const picture =
          image.width && image.height ? (
            <SkeletonImage
              src={image.src}
              alt={image.alt}
              width={image.width}
              height={image.height}
              sizes={sizes}
              unoptimized={isExternal(image.src)}
              className="h-auto w-full"
            />
          ) : (
            <span className="relative block aspect-[4/3]">
              <SkeletonImage
                src={image.src}
                alt={image.alt}
                fill
                sizes={sizes}
                unoptimized={isExternal(image.src)}
                className={contain ? 'object-contain p-2' : 'object-cover'}
              />
            </span>
          );
        return (
          <li key={image.src} className="bg-muted overflow-hidden rounded-2xl">
            {onPick ? (
              <button
                type="button"
                onClick={() => {
                  onPick(index);
                }}
                aria-label={`Ampliar la foto ${index + 1} de ${images.length}`}
                className="focus-visible:ring-ring/50 block w-full cursor-zoom-in outline-none focus-visible:ring-[3px]"
              >
                {picture}
              </button>
            ) : (
              <a
                href={image.src}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={image.alt}
                className="block cursor-zoom-in"
              >
                {picture}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** El visor de a una foto, a pantalla completa, con flechas y teclado. */
function PhotoViewer({
  title,
  photos,
  index,
  onIndexChange,
}: {
  readonly title: string;
  readonly photos: readonly ListingImage[];
  readonly index: number | null;
  readonly onIndexChange: (index: number | null) => void;
}) {
  const current = index === null ? undefined : photos[index];
  // Las vecinas se bajan mientras se mira la actual, para que las flechas no esperen.
  const neighbors =
    index === null || photos.length < 2
      ? []
      : [...new Set([(index + 1) % photos.length, (index - 1 + photos.length) % photos.length])]
          .map((i) => photos[i])
          .filter((photo) => photo !== undefined);
  const step = (delta: number) => {
    if (index !== null) onIndexChange((index + delta + photos.length) % photos.length);
  };

  return (
    <Dialog
      open={current !== undefined}
      onOpenChange={(isOpen) => {
        if (!isOpen) onIndexChange(null);
      }}
    >
      <DialogContent
        className="max-w-[min(72rem,calc(100%-1rem))] gap-3 border-0 bg-black p-2 text-white sm:max-w-[min(72rem,calc(100%-2rem))] sm:p-4 [&>[data-slot=dialog-close]]:text-white"
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') step(1);
          if (event.key === 'ArrowLeft') step(-1);
        }}
      >
        <DialogTitle className="sr-only">Fotos de {title}</DialogTitle>
        <DialogDescription className="text-sm text-white/70">
          {index === null ? '' : `${index + 1} de ${photos.length}`}
          {current?.alt && current.alt !== title ? ` · ${current.alt}` : ''}
        </DialogDescription>
        {current && (
          <div className="relative h-[70vh]">
            <SkeletonImage
              key={current.src}
              src={current.src}
              alt={current.alt}
              fill
              sizes="100vw"
              unoptimized={isExternal(current.src)}
              className="object-contain"
            />
            {neighbors.map((photo) => (
              <Image
                key={photo.src}
                src={photo.src}
                alt=""
                fill
                sizes="100vw"
                loading="eager"
                unoptimized={isExternal(photo.src)}
                className="invisible object-contain"
              />
            ))}
          </div>
        )}
        {photos.length > 1 && (
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                step(-1);
              }}
              aria-label="Foto anterior"
              className="flex size-11 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
            >
              <ChevronLeft aria-hidden className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                step(1);
              }}
              aria-label="Foto siguiente"
              className="flex size-11 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
            >
              <ChevronRight aria-hidden className="size-5" />
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
