import { PageHeader } from '@norde/ui/components/page-header';
import { SettingsIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { companyFeatures } from '../../../config/env';
import { CompanyTabs } from '../../../features/identity/components/company-tabs';

export default function CompanyLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={SettingsIcon}
        title="Mi empresa"
        subtitle="Datos de Norde, códigos, ficha, archivos, catálogos de propiedades y quién usa el panel"
      />
      <CompanyTabs features={companyFeatures()} />
      {children}
    </div>
  );
}
