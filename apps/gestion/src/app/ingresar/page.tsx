import { PublicLayout } from '@norde/ui/components/public-layout';
import type { Metadata, Route } from 'next';
import { redirect } from 'next/navigation';

import { SignInForm } from '../../features/identity/components/sign-in-form';
import { safeReturnPath } from '../../features/identity/sign-in';
import type { SearchParams } from '../../lib/list-params';
import { getSession, SIGN_IN_REASON_PARAM, SUSPENDED_REASON } from '../../lib/session';

export const metadata: Metadata = { title: 'Ingresar' };

export default async function SignInPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnPath(params.volver);

  // Con una sesión válida no hay nada que hacer acá. Ruta validada por `safeReturnPath`.
  const session = await getSession();
  if (session.isOk()) redirect(returnTo as Route);

  return (
    <PublicLayout>
      <SignInForm
        returnTo={returnTo}
        suspended={params[SIGN_IN_REASON_PARAM] === SUSPENDED_REASON}
      />
    </PublicLayout>
  );
}
