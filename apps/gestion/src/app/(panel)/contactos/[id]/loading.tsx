import { Card } from '@norde/ui/components/card';
import { Skeleton } from '@norde/ui/components/skeleton';

export default function ContactDetailLoading() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-5 w-40" />
      <Card className="h-40" />
      <Skeleton className="h-10 w-full max-w-xs rounded-xl" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="h-48" />
        <Card className="h-48" />
      </div>
    </div>
  );
}
