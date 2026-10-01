import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

/** `false` en el server y en la hidratación; `true` después. Evita desajustes de hidratación. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
