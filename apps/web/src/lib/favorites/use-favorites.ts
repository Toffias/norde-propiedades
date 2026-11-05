'use client';

import { useCallback, useSyncExternalStore } from 'react';

import {
  FAVORITES_STORAGE_KEY,
  MAX_FAVORITES,
  parseFavorites,
  toggleFavorite,
  type Favorite,
} from './favorites';

const EMPTY: readonly Favorite[] = [];
const listeners = new Set<() => void>();

/** La última lectura, para que React reciba la misma referencia mientras no cambie. */
let cache: { readonly raw: string | null; readonly favorites: readonly Favorite[] } = {
  raw: null,
  favorites: EMPTY,
};

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(FAVORITES_STORAGE_KEY);
  } catch {
    // Navegación privada o almacenamiento bloqueado: sin favoritos guardados.
    return null;
  }
}

function snapshot(): readonly Favorite[] {
  const raw = readRaw();
  if (raw !== cache.raw) cache = { raw, favorites: parseFavorites(raw) };
  return cache.favorites;
}

function write(favorites: readonly Favorite[]): void {
  try {
    if (favorites.length === 0) window.localStorage.removeItem(FAVORITES_STORAGE_KEY);
    else window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  } catch {
    // Sin almacenamiento, los favoritos duran lo que dura la página.
    cache = { raw: null, favorites };
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Otra pestaña cambió los favoritos.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === FAVORITES_STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Los favoritos del visitante, compartidos entre componentes y pestañas. */
export function useFavorites() {
  const favorites = useSyncExternalStore(subscribe, snapshot, () => EMPTY);

  const toggle = useCallback((favorite: Favorite) => {
    write(toggleFavorite(snapshot(), favorite));
  }, []);
  const remove = useCallback((id: string) => {
    write(snapshot().filter((item) => item.id !== id));
  }, []);
  const clear = useCallback(() => {
    write(EMPTY);
  }, []);

  return {
    favorites,
    isFull: favorites.length >= MAX_FAVORITES,
    has: (id: string) => favorites.some((item) => item.id === id),
    toggle,
    remove,
    clear,
  };
}
