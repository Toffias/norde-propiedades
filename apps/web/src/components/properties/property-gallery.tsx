'use client';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@norde/ui/components/dialog';
import { cn } from '@norde/ui/lib/utils';
import { ChevronLeft, ChevronRight, Grid2X2, House } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

import { isExternal } from '../../lib/properties/images';
import type { ListingImage } from '../../lib/properties/view';

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

interface PropertyGalleryProps {
  readonly title: string;
  readonly photos: readonly ListingImage[];
}

/**
 * Galería de la ficha: un mosaico con la portada grande y cuatro fotos más; cualquier foto abre
 * el visor a pantalla completa, que se recorre con flechas o con el teclado.
 */
export function PropertyGallery({ title, photos }: PropertyGalleryProps) {
  const [open, setOpen] = useState<number | null>(null);

  if (photos.length === 0) {
    return (
      <div className="bg-muted text-muted-foreground flex aspect-[16/9] items-center justify-center rounded-3xl">
        <House aria-hidden className="size-12" />
        <span className="sr-only">Esta propiedad todavía no tiene fotos.</span>
      </div>
    );
  }

  const mosaic = photos.slice(0, 5);
  const current = open === null ? undefined : photos[open];
  const step = (delta: number) => {
    setOpen((index) => (index === null ? index : (index + delta + photos.length) % photos.length));
  };

  return (
    <>
      <div className="relative grid aspect-[4/3] gap-2 overflow-hidden rounded-3xl sm:aspect-[16/8] sm:grid-cols-4 sm:grid-rows-2">
        {mosaic.map((photo, index) => (
          <button
            key={photo.src}
            type="button"
            onClick={() => {
              setOpen(index);
            }}
            aria-label={`Ver la foto ${index + 1} de ${photos.length}`}
            className={cn(
              'bg-muted focus-visible:ring-ring/50 relative overflow-hidden outline-none focus-visible:ring-[3px]',
              index === 0 ? 'sm:row-span-2' : 'hidden sm:block',
              tileSpan(index, mosaic.length),
            )}
          >
            <Image
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
        {photos.length > 1 && (
          <button
            type="button"
            onClick={() => {
              setOpen(0);
            }}
            className="bg-card/95 text-foreground absolute right-3 bottom-3 flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold shadow-md"
          >
            <Grid2X2 aria-hidden className="size-4" />
            Ver las {photos.length} fotos
          </button>
        )}
      </div>

      <Dialog
        open={current !== undefined}
        onOpenChange={(isOpen) => {
          if (!isOpen) setOpen(null);
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
            {open === null ? '' : `${open + 1} de ${photos.length}`}
            {current?.alt && current.alt !== title ? ` · ${current.alt}` : ''}
          </DialogDescription>
          {current && (
            <div className="relative h-[70vh]">
              <Image
                src={current.src}
                alt={current.alt}
                fill
                sizes="100vw"
                unoptimized={isExternal(current.src)}
                className="object-contain"
              />
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
    </>
  );
}
