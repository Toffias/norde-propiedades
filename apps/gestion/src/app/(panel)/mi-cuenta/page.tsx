import { ListMyActivityQuerySchema } from '@norde/core/audit/contracts';
import { Badge } from '@norde/ui/components/badge';
import { Button } from '@norde/ui/components/button';
import { DataTableError } from '@norde/ui/components/data-table';
import { PageHeader } from '@norde/ui/components/page-header';
import { SectionCard } from '@norde/ui/components/section-card';
import { HistoryIcon, IdCardIcon, KeyRoundIcon, UserRoundIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { getContainer } from '../../../container';
import { AccountActivity } from '../../../features/account/components/account-activity';
import { ACCOUNT_ACTIVITY_ERROR_MESSAGES } from '../../../features/account/messages';
import { TwoFactorSettings } from '../../../features/identity/components/two-factor-settings';
import { newsDayOf } from '../../../features/news/news-format';
import { messageForError } from '../../../lib/errors';
import { formatCount } from '../../../lib/format';
import { parseListParams, type SearchParams } from '../../../lib/list-params';
import { requireSession } from '../../../lib/session';

export const metadata: Metadata = { title: 'Mi cuenta' };

/**
 * La cuenta propia: los datos, la seguridad (contraseña y verificación en dos pasos, #113) y el
 * historial de todo lo que hizo con ella. Cualquier usuario entra; no pide permisos.
 */
export default async function AccountPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor, profile } = await requireSession();
  const { value: query } = parseListParams(ListMyActivityQuerySchema, await searchParams);
  const result = await getContainer().account.listMyActivity.execute(query, actor);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon={UserRoundIcon} title="Mi cuenta" subtitle={profile.email} />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <SectionCard title="Datos" icon={IdCardIcon}>
            <dl className="grid gap-3 text-sm">
              <div className="grid gap-0.5">
                <dt className="text-xs text-muted-foreground">Nombre</dt>
                <dd className="font-medium">{profile.name}</dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd className="break-all">{profile.email}</dd>
              </div>
              {profile.roles.length > 0 && (
                <div className="grid gap-1">
                  <dt className="text-xs text-muted-foreground">
                    {profile.roles.length === 1 ? 'Rol' : 'Roles'}
                  </dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {profile.roles.map((role) => (
                      <Badge key={role.key} variant="secondary">
                        {role.name}
                      </Badge>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </SectionCard>
          <SectionCard
            title="Contraseña"
            icon={KeyRoundIcon}
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/cambiar-contrasena">Cambiar</Link>
              </Button>
            }
          >
            <p className="text-sm leading-normal text-muted-foreground">
              La que usás para ingresar al panel. Si te la olvidás, un administrador te la puede
              blanquear.
            </p>
          </SectionCard>
          <TwoFactorSettings enabled={profile.twoFactorEnabled} />
        </div>
        <SectionCard
          title="Historial"
          icon={HistoryIcon}
          action={
            result.isOk() ? (
              <span className="text-sm text-muted-foreground">
                {formatCount(result.value.total, 'acción', 'acciones')}
              </span>
            ) : undefined
          }
          className="overflow-hidden"
          bodyClassName="p-0"
        >
          {result.isErr() ? (
            <DataTableError
              message={messageForError(result.error, ACCOUNT_ACTIVITY_ERROR_MESSAGES)}
            />
          ) : (
            <AccountActivity
              page={result.value}
              viewerId={actor.id}
              today={newsDayOf(new Date())}
              area={query.area}
              from={query.from}
              to={query.to}
            />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
