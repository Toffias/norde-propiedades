import { ListInquiryRulesQuerySchema } from '@norde/core/clients/contracts';
import { Button } from '@norde/ui/components/button';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import { PageHeader } from '@norde/ui/components/page-header';
import { ArrowLeftIcon, WorkflowIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { inquiryRulesEnabled } from '../../../../config/env';
import { getContainer } from '../../../../container';
import { InquiryRulesView } from '../../../../features/inquiries/components/inquiry-rules-view';
import { LIST_INQUIRY_RULES_ERROR_MESSAGES } from '../../../../features/inquiries/messages';
import { messageForError } from '../../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../../lib/list-params';
import { requireSession } from '../../../../lib/session';

export const metadata: Metadata = { title: 'Reglas de asignación' };

export default async function InquiryRulesPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  if (!inquiryRulesEnabled()) notFound();
  const { actor } = await requireSession();
  const { value: query } = parseListParams(ListInquiryRulesQuerySchema, await searchParams);
  const result = await getContainer().inquiries.listInquiryRules.execute(query, actor);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={WorkflowIcon}
        title="Reglas de asignación"
        subtitle="Cada consulta que entra va a la primera regla activa que cumple, en este orden, y se reparte entre sus agentes según su peso"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/consultas">
              <ArrowLeftIcon className="h-4 w-4" />
              Volver a consultas
            </Link>
          </Button>
        }
      />
      <Card className="gap-0 overflow-hidden p-0">
        {result.isErr() ? (
          <DataTableError
            message={messageForError(result.error, LIST_INQUIRY_RULES_ERROR_MESSAGES)}
          />
        ) : (
          <InquiryRulesView
            rows={result.value.items}
            total={result.value.total}
            page={result.value.page}
            pageSize={result.value.pageSize}
            status={query.status}
          />
        )}
      </Card>
    </div>
  );
}
