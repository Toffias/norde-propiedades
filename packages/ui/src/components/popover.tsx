'use client';

import { Popover as PopoverPrimitive } from 'radix-ui';
import type { ComponentProps, TouchEvent, WheelEvent } from 'react';

import { cn } from '../lib/utils';

export function Popover(props: ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

export function PopoverTrigger(props: ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

export function PopoverAnchor(props: ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

/**
 * Frena la propagación de `wheel`/`touchmove`: dentro de un Dialog, el bloqueo de scroll de Radix
 * se comería el scroll de las listas del popover (que vive en un portal fuera del Dialog).
 */
export function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  onWheel,
  onTouchMove,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        onWheel={(event: WheelEvent<HTMLDivElement>) => {
          event.stopPropagation();
          onWheel?.(event);
        }}
        onTouchMove={(event: TouchEvent<HTMLDivElement>) => {
          event.stopPropagation();
          onTouchMove?.(event);
        }}
        className={cn(
          'z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
