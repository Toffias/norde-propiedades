import { Card, CardContent } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import { PageHeader } from '@norde/ui/components/page-header';
import { ArrowLeftIcon, CalculatorIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AppraisalForm } from '../../../../features/appraisals/components/appraisal-form';
import { APPRAISAL_ERROR_MESSAGES } from '../../../../features/appraisals/messages';
import { requireSession } from '../../../../lib/session';

export const metadata: Metadata = { title: 'Nueva tasación' };

export default async function NewAppraisalPage() {
  const { actor } = await requireSession();
  const canCreate = actor.can('appraisals:create');

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/tasaciones"
        className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Volver a tasaciones
      </Link>
      <PageHeader
        icon={CalculatorIcon}
        title="Nueva tasación"
        subtitle="Nace solicitada; el resultado se carga cuando esté tasada"
      />
      <Card>
        {canCreate ? (
          <CardContent>
            <AppraisalForm canEdit />
          </CardContent>
        ) : (
          <DataTableError message={APPRAISAL_ERROR_MESSAGES.Forbidden} />
        )}
      </Card>
    </div>
  );
}
