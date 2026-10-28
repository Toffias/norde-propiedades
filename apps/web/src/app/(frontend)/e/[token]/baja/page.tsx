import type { Metadata } from 'next';

import { UnsubscribeButton } from '../../../../../components/shared-listings/unsubscribe-button';
import { buildMetadata, withBrand } from '../../../../../lib/seo/metadata';
import { routes } from '../../../../../lib/seo/routes';

// Privada y por request: el link es de un cliente, no se cachea ni se indexa (#106).
export const dynamic = 'force-dynamic';

type Props = PageProps<'/e/[token]/baja'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  return {
    ...buildMetadata({
      title: withBrand('Dejar de recibir emails'),
      description: 'Darse de baja de los envíos automáticos de propiedades.',
      path: routes.followUpUnsubscribe(token),
      noIndex: true,
    }),
    // El token es la llave del link: no viaja a otros sitios en el `Referer`.
    referrer: 'no-referrer',
  };
}

/** La baja de los seguimientos automáticos, desde el link del pie del email. */
export default async function FollowUpUnsubscribePage({ params }: Props) {
  const { token } = await params;
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-4 py-24 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        ¿Querés dejar de recibir estos emails?
      </h1>
      <p className="text-muted-foreground">
        Te mandamos las propiedades nuevas y las bajas de precio que coinciden con lo que estás
        buscando. Si te das de baja, no te mandamos más estos emails automáticos. Tu asesor te puede
        seguir escribiendo.
      </p>
      <UnsubscribeButton token={decodeURIComponent(token)} />
    </div>
  );
}
