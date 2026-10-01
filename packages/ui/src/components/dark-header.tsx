import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../lib/utils';
import { Skeleton } from './skeleton';

/** Cabecera de una ficha (propiedad, contrato). `aside`: StatusPill y acciones. */
export function DarkHeader({
  icon: Icon,
  title,
  subtitle,
  aside,
  className,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly subtitle?: ReactNode;
  readonly aside?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-4 rounded-2xl bg-linear-to-br from-entity-header-from to-entity-header-to px-5 py-5 text-white',
        className,
      )}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-500">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-extrabold !text-white" title={title}>
          {title}
        </h1>
        {subtitle !== undefined && (
          <p className="mt-0.5 text-sm leading-normal text-entity-header-muted">{subtitle}</p>
        )}
      </div>
      {aside !== undefined && <div className="flex flex-wrap items-center gap-2">{aside}</div>}
    </div>
  );
}

export function DarkHeaderSkeleton() {
  return <Skeleton className="h-[88px] rounded-2xl" />;
}
