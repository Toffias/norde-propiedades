'use client';

import { Button } from '@norde/ui/components/button';
import { CircleHelpIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';

import { PANEL_TOURS } from '../tours/panel-tours';
import { tourFor, tourSelector, type Tour } from '../tours/tour';

/** El primer elemento visible con ese `data-tour` (en mobile, el menú lateral está oculto). */
function visibleTarget(target: string): Element | undefined {
  return Array.from(document.querySelectorAll(tourSelector(target))).find(
    (element) => element.getClientRects().length > 0,
  );
}

async function startTour(tour: Tour) {
  const { driver } = await import('driver.js');
  // Se saltean los pasos cuyo elemento no está: sin permiso, sin datos o fuera de la pantalla.
  const steps = tour.steps.flatMap((step) => {
    const element = step.target === undefined ? undefined : visibleTarget(step.target);
    if (step.target !== undefined && element === undefined) return [];
    return [
      {
        ...(element ? { element } : {}),
        popover: {
          title: step.title,
          description: step.description,
          ...(step.side ? { side: step.side } : {}),
        },
      },
    ];
  });
  driver({
    steps,
    showProgress: steps.length > 1,
    progressText: '{{current}} de {{total}}',
    nextBtnText: 'Siguiente',
    prevBtnText: 'Anterior',
    doneBtnText: 'Listo',
    closeBtnLabel: 'Cerrar',
    popoverClass: 'norde-tour',
    stagePadding: 6,
    stageRadius: 8,
    overlayOpacity: 0.55,
    smoothScroll: true,
  }).drive();
}

/** El "?" de la barra superior: abre el tutorial de la pantalla. Sin tutorial, no se muestra. */
export function HelpTourButton() {
  const pathname = usePathname();
  const tour = tourFor(pathname, PANEL_TOURS);
  if (tour === undefined) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="px-2"
      data-tour="shell-help"
      aria-label="Ver el tutorial de esta pantalla"
      title="Ver el tutorial de esta pantalla"
      onClick={() => void startTour(tour)}
    >
      <CircleHelpIcon className="h-4 w-4" />
    </Button>
  );
}
