import type { ReactNode } from 'react';

import { companyFeatures } from '../../../config/env';
import { CompanyTabs } from '../../../features/identity/components/company-tabs';

export default function CompanyLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <CompanyTabs features={companyFeatures()} />
      {children}
    </div>
  );
}
