import { PageHeader } from '@norde/ui/components/page-header';
import { SettingsIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { CompanyTabs } from '../../../features/identity/components/company-tabs';

export default function CompanyLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={SettingsIcon}
        title="Mi empresa"
        subtitle="Quién usa el panel y qué puede hacer"
      />
      <CompanyTabs />
      {children}
    </div>
  );
}
