'use client';

import type { BackgroundTaskScope } from '@norde/core/reporting/contracts';
import { Button } from '@norde/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@norde/ui/components/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@norde/ui/components/tabs';
import { BellIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { countUnreadNotificationsAction } from '../notification-actions';
import { badgeCount, UNREAD_POLL_MS } from '../notifications';

import { BackgroundTasksPanel, useActiveTasks } from './background-tasks';
import { NotificationsPanel } from './notifications-panel';

type BellTab = 'notices' | 'tasks';

/** Las no leídas: las trae el layout y, con la campana cerrada, se vuelven a contar cada tanto. */
function useUnread(initialUnread: number, open: boolean) {
  const [unread, setUnread] = useState(initialUnread);
  const onUnread = useCallback((count: number) => {
    setUnread(count);
  }, []);

  // El layout se vuelve a pintar al navegar o al revalidar: trae el contador nuevo.
  const [counted, setCounted] = useState(initialUnread);
  if (counted !== initialUnread) {
    setCounted(initialUnread);
    setUnread(initialUnread);
  }

  useEffect(() => {
    if (open) return undefined;
    const timer = setInterval(() => {
      countUnreadNotificationsAction().then(
        (response) => {
          if (response.ok) setUnread(response.value.unread);
        },
        () => undefined,
      );
    }, UNREAD_POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [open]);

  return { unread, onUnread };
}

function bellLabel(unread: number, active: number): string {
  const parts = [
    unread > 0 ? `${String(unread)} sin leer` : undefined,
    active > 0 ? `${String(active)} en curso` : undefined,
  ].filter((part) => part !== undefined);
  return parts.length === 0 ? 'Notificaciones' : `Notificaciones: ${parts.join(', ')}`;
}

function TabCount({ count }: { readonly count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-none font-bold text-primary-foreground">
      {badgeCount(count)}
    </span>
  );
}

/**
 * La campana de la barra superior (#112, ADR 0040 y 0043). Dos pestañas: "Avisos", lo que le
 * asignaron a quien entra, y "Procesos", los procesos en segundo plano. El número suma los avisos
 * sin leer y los procesos en curso.
 */
export function NotificationBell({
  initialUnread,
  initialActive,
  canSeeAllTasks,
}: {
  /** Los avisos sin leer de quien entra, contados por el layout. */
  readonly initialUnread: number;
  /** Los procesos en curso de quien entra, contados por el layout. */
  readonly initialActive: number;
  /** Puede ver los procesos de todos: el caso de uso lo vuelve a verificar. */
  readonly canSeeAllTasks: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<BellTab>('notices');
  const [scope, setScope] = useState<BackgroundTaskScope>('mine');
  const { unread, onUnread } = useUnread(initialUnread, open);
  const { active, onActive } = useActiveTasks(initialActive, { open, scope });

  function changeOpen(next: boolean) {
    // Sin avisos nuevos y con procesos corriendo, abre en lo que está pasando.
    if (next) setTab(unread === 0 && active > 0 ? 'tasks' : 'notices');
    setOpen(next);
  }
  const close = () => {
    setOpen(false);
  };

  const total = unread + active;
  const label = bellLabel(unread, active);
  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="relative px-2"
          aria-label={label}
          title={label}
        >
          <BellIcon className="h-4 w-4" aria-hidden />
          {total > 0 && (
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-none font-bold text-primary-foreground"
            >
              {badgeCount(total)}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value === 'tasks' ? 'tasks' : 'notices');
          }}
          className="gap-0"
        >
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
            <h2 className="text-sm font-semibold text-foreground">Notificaciones</h2>
            <TabsList>
              <TabsTrigger value="notices">
                Avisos
                <TabCount count={unread} />
              </TabsTrigger>
              <TabsTrigger value="tasks">
                Procesos
                <TabCount count={active} />
              </TabsTrigger>
            </TabsList>
          </header>
          <TabsContent value="notices">
            <NotificationsPanel
              open={open && tab === 'notices'}
              onUnread={onUnread}
              onNavigate={close}
            />
          </TabsContent>
          <TabsContent value="tasks">
            <BackgroundTasksPanel
              open={open && tab === 'tasks'}
              scope={scope}
              onScopeChange={setScope}
              canSeeAll={canSeeAllTasks}
              onActive={onActive}
              onNavigate={close}
            />
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
