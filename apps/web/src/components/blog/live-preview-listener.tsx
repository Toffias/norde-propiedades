'use client';

import { RefreshRouteOnSave } from '@payloadcms/live-preview-react';
import { useRouter } from 'next/navigation';

/** En el live preview del admin, refresca la página cada vez que el editor guarda (autosave). */
export function LivePreviewListener({ serverURL }: { readonly serverURL: string }) {
  const router = useRouter();
  return (
    <RefreshRouteOnSave
      serverURL={serverURL}
      refresh={() => {
        router.refresh();
      }}
    />
  );
}
