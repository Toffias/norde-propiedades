import {
  ListAppraisalHistoryQuerySchema,
  type AppraisalDetail,
} from '@norde/core/appraisals/contracts';
import { canActOn, OWNERSHIP_RULES, type SessionActor } from '@norde/core/identity';
import { Card, CardContent } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import { ArrowLeftIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getContainer } from '../../../../container';
import { AppraisalForm } from '../../../../features/appraisals/components/appraisal-form';
import {
  AppraisalHeader,
  type AppraisalDetailPermissions,
} from '../../../../features/appraisals/components/appraisal-header';
import { AppraisalHistoryGrid } from '../../../../features/appraisals/components/appraisal-history-grid';
import { AppraisalPhotosSection } from '../../../../features/appraisals/components/appraisal-photos-section';
import { AppraisalResultSection } from '../../../../features/appraisals/components/appraisal-result-section';
import { AppraisalTabs } from '../../../../features/appraisals/components/appraisal-tabs';
import { APPRAISAL_TABS, type AppraisalTab } from '../../../../features/appraisals/labels';
import { APPRAISAL_READ_ERROR_MESSAGES } from '../../../../features/appraisals/messages';
import { messageForError } from '../../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../../lib/list-params';
import { requireSession } from '../../../../lib/session';

function tabFrom(params: SearchParams): AppraisalTab {
  const raw = params.tab;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return APPRAISAL_TABS.find((tab) => tab === value) ?? 'datos';
}

/** Qué ofrece la ficha. Ver la tasación ya lo decidió el caso de uso; cada acción lo vuelve a decidir. */
function permissionsFor(
  actor: SessionActor['actor'],
  detail: AppraisalDetail,
): AppraisalDetailPermissions {
  const owners = [detail.producer.id, detail.appraiser?.id];
  const editable = detail.deletedAt === undefined && detail.status !== 'converted';
  const edit = editable && actor.can('appraisals:update');
  return {
    edit,
    convert: edit && actor.can('properties:create'),
    delete: actor.can('appraisals:delete'),
    history: owners.some((ownerId) =>
      canActOn(actor, OWNERSHIP_RULES.auditRead, {
        ownerId,
        ownerBranchId: detail.branch?.id,
      }),
    ),
  };
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<Metadata> {
  const { actor } = await requireSession();
  const { id } = await params;
  const detail = await getContainer().appraisals.getAppraisal.execute({ appraisalId: id }, actor);
  return { title: detail.isOk() ? `${detail.value.code} · Tasaciones` : 'Tasación' };
}

export default async function AppraisalDetailPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const result = await getContainer().appraisals.getAppraisal.execute({ appraisalId: id }, actor);
  if (result.isErr()) {
    if (result.error.type === 'AppraisalNotFound' || result.error.type === 'InvalidInput') {
      notFound();
    }
    return (
      <DataTableError message={messageForError(result.error, APPRAISAL_READ_ERROR_MESSAGES)} />
    );
  }
  const detail = result.value;
  const tab = tabFrom(query);
  const permissions = permissionsFor(actor, detail);

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/tasaciones"
        className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Volver a tasaciones
      </Link>

      <AppraisalHeader detail={detail} permissions={permissions} />
      <AppraisalTabs appraisalId={detail.id} active={tab} showHistory={permissions.history} />

      {tab === 'historial' ? (
        await renderHistory(detail, permissions, actor, query)
      ) : tab === 'resultado' ? (
        // `key`: al guardar, la vista vuelve a tomar los valores de la ficha.
        <AppraisalResultSection
          key={detail.updatedAt.toISOString()}
          detail={detail}
          canEdit={permissions.edit}
        />
      ) : tab === 'fotos' ? (
        <AppraisalPhotosSection
          appraisalId={detail.id}
          photoIds={detail.photoIds}
          canEdit={permissions.edit}
        />
      ) : (
        <Card>
          <CardContent>
            {/* `key`: al guardar, el formulario vuelve a tomar los valores de la ficha. */}
            <AppraisalForm
              key={detail.updatedAt.toISOString()}
              detail={detail}
              canEdit={permissions.edit}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

async function renderHistory(
  detail: AppraisalDetail,
  permissions: AppraisalDetailPermissions,
  actor: SessionActor['actor'],
  query: SearchParams,
) {
  if (!permissions.history) {
    return (
      <Card className="gap-0 overflow-hidden p-0">
        <DataTableError
          message={messageForError({ type: 'Forbidden' }, APPRAISAL_READ_ERROR_MESSAGES)}
        />
      </Card>
    );
  }
  const { value } = parseListParams(ListAppraisalHistoryQuerySchema, {
    ...query,
    appraisalId: detail.id,
  });
  const page = await getContainer().appraisals.listAppraisalHistory.execute(value, actor);
  if (page.isErr()) {
    return (
      <Card className="gap-0 overflow-hidden p-0">
        <DataTableError message={messageForError(page.error, APPRAISAL_READ_ERROR_MESSAGES)} />
      </Card>
    );
  }
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <AppraisalHistoryGrid page={page.value} from={value.from} to={value.to} />
    </Card>
  );
}
