import { Button } from '@norde/ui/components/button';
import { WhatsAppIcon } from '@norde/ui/components/whatsapp-icon';
import { House } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ListingCard } from '../../../../components/properties/listing-card';
import { OpenBeacon } from '../../../../components/shared-listings/open-beacon';
import { ReactionButtons } from '../../../../components/shared-listings/reaction-buttons';
import { BUSINESS } from '../../../../constants/business';
import { buildMetadata, withBrand } from '../../../../lib/seo/metadata';
import { routes } from '../../../../lib/seo/routes';
import { loadSharedListing } from '../../../../lib/shared-listings/load';
import { whatsappHref } from '../../../../lib/whatsapp';

// Privada y por request: el link es de un cliente, no se cachea ni se indexa (#104).
export const dynamic = 'force-dynamic';

type Props = PageProps<'/e/[token]'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  return {
    ...buildMetadata({
      title: withBrand('Propiedades para vos'),
      description: 'Las propiedades que te recomendamos en Norde Propiedades.',
      path: routes.sharedListing(token),
      noIndex: true,
    }),
    // El token es la llave del link: no viaja a otros sitios en el `Referer`.
    referrer: 'no-referrer',
  };
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

/** Las propiedades que un asesor le mandó a un cliente, con "me gusta" y "no me gusta". */
export default async function SharedListingPage({ params }: Props) {
  const { token } = await params;
  const view = await loadSharedListing(decodeURIComponent(token));
  if (view.kind === 'not_found') notFound();
  if (view.kind === 'unavailable') return <Unavailable reason={view.reason} />;

  const whatsapp = whatsappHref('Hola, quiero consultar por las propiedades que me enviaron.');
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <OpenBeacon token={decodeURIComponent(token)} />
      <header className="flex flex-col gap-3">
        <p className="text-brand-600 text-sm font-semibold tracking-wide uppercase">
          {view.advisorName ? `De parte de ${view.advisorName}` : BUSINESS.name}
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          {view.entries.length === 1
            ? 'Una propiedad para vos'
            : `${view.entries.length.toLocaleString('es-AR')} propiedades para vos`}
        </h1>
        <p className="text-muted-foreground max-w-2xl">
          Contanos cuáles te gustan y cuáles no: así te buscamos opciones más parecidas a lo que
          querés. Este link está disponible hasta el {formatDate(view.expiresAt)}.
        </p>
      </header>

      <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {view.entries.map((entry, index) => (
          <li key={entry.propertyId} className="flex flex-col gap-3">
            {entry.card ? (
              <>
                <ListingCard listing={entry.card} priority={index < 3} headingLevel="h2" />
                <ReactionButtons
                  token={decodeURIComponent(token)}
                  propertyId={entry.propertyId}
                  title={entry.card.title}
                  initial={entry.reaction}
                />
              </>
            ) : (
              <div className="bg-muted/50 text-muted-foreground flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-3xl border border-dashed p-6 text-center text-sm">
                <House aria-hidden className="size-8" />
                Esta propiedad ya no está disponible.
              </div>
            )}
          </li>
        ))}
      </ul>

      {whatsapp && (
        <div className="bg-card flex flex-col items-start gap-3 rounded-3xl border p-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-semibold">¿Querés visitar alguna o tenés dudas?</p>
          <Button asChild className="bg-whatsapp hover:bg-whatsapp/90 text-white">
            <a href={whatsapp} target="_blank" rel="noopener noreferrer">
              <WhatsAppIcon className="size-4" />
              Escribinos por WhatsApp
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}

function Unavailable({ reason }: { readonly reason: 'expired' | 'revoked' }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-4 py-24 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Este link ya no está disponible</h1>
      <p className="text-muted-foreground">
        {reason === 'expired'
          ? 'Venció el plazo para ver estas propiedades.'
          : 'Tu asesor lo dio de baja.'}{' '}
        Mirá todas las propiedades que tenemos o pedile a tu asesor que te las mande de nuevo.
      </p>
      <Button asChild>
        <Link href={routes.properties()}>Ver propiedades</Link>
      </Button>
    </div>
  );
}
