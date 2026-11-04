import type { Metadata } from 'next';
import Link from 'next/link';

import { ConfirmSubscriptionButton } from '../../../../components/subscriptions/confirm-subscription-button';
import { getContainer } from '../../../../container';
import { buildMetadata, withBrand } from '../../../../lib/seo/metadata';
import { routes } from '../../../../lib/seo/routes';
import { FREQUENCY_LABELS } from '../../../../lib/subscriptions/search-subscription';

// Privada y por request: el link es de una persona, no se cachea ni se indexa (#208).
export const dynamic = 'force-dynamic';

type Props = PageProps<'/suscripcion/[token]'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  return {
    ...buildMetadata({
      title: withBrand('Confirmá tu suscripción'),
      description: 'Confirmar la suscripción a una búsqueda de propiedades.',
      path: routes.searchSubscription(token),
      noIndex: true,
    }),
    // El token es la llave del link: no viaja a otros sitios en el `Referer`.
    referrer: 'no-referrer',
  };
}

/** La confirmación de una suscripción a una búsqueda, desde el link del email (#208). */
export default async function SearchSubscriptionPage({ params }: Props) {
  const token = decodeURIComponent((await params).token);
  const found = await getContainer().searchSubscriptions.get({ token });
  const view = found.isOk() ? found.value : undefined;

  if (view === undefined || view.status === 'expired') {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-4 py-24 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          {view === undefined ? 'No encontramos este link' : 'Este link venció'}
        </h1>
        <p className="text-muted-foreground">
          Volvé a buscar en el listado de propiedades y suscribite de nuevo: te mandamos otro email
          para confirmar.
        </p>
        <Link
          href={routes.properties()}
          className="text-primary font-semibold underline-offset-2 hover:underline"
        >
          Ir a las propiedades
        </Link>
      </div>
    );
  }

  const confirmed = view.status === 'confirmed';
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-4 py-24 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        {confirmed ? 'Tu suscripción ya está activa' : 'Confirmá tu suscripción'}
      </h1>
      <p className="text-muted-foreground">
        {confirmed
          ? 'Te vamos a escribir cuando aparezca algo para vos en esta búsqueda:'
          : 'Vas a recibir por email las propiedades nuevas y las bajas de precio de esta búsqueda:'}
      </p>
      <p className="bg-muted w-full rounded-xl px-4 py-3 font-semibold">{view.summary}</p>
      <p className="text-muted-foreground text-sm">
        Frecuencia: {FREQUENCY_LABELS[view.frequency].toLocaleLowerCase('es-AR')}.
      </p>
      {!confirmed && <ConfirmSubscriptionButton token={token} />}
    </div>
  );
}
