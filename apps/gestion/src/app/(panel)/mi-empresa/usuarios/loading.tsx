import { Card } from '@norde/ui/components/card';
import { DataTableSkeleton } from '@norde/ui/components/data-table';

export default function UsersLoading() {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <DataTableSkeleton />
    </Card>
  );
}
