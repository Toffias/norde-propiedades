import { PublicLayout } from '@norde/ui/components/public-layout';
import type { Metadata } from 'next';

import { SignInDemo } from '../_components/sign-in-demo';

export const metadata: Metadata = { title: 'Ingresar' };

export default function SignInPatternPage() {
  return (
    <PublicLayout>
      <SignInDemo />
    </PublicLayout>
  );
}
