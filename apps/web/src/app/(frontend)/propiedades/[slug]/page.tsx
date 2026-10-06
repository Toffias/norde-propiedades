import { WhatsAppIcon } from '@norde/ui/components/whatsapp-icon';
import { MapPin, PlayCircle, Rotate3d } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SectionHeading } from '../../../../components/layout/section-heading';
import { InquiryForm } from '../../../../components/properties/inquiry-form';
import { ListingGrid } from '../../../../components/properties/listing-card';
import { PropertyGallery } from '../../../../components/properties/property-gallery';
import { PropertyMap } from '../../../../components/properties/property-map';
import { Breadcrumbs } from '../../../../components/seo/breadcrumbs';
import { JsonLdScript } from '../../../../components/seo/json-ld-script';
import { getContainer } from '../../../../container';
import { summarize } from '../../../../lib/blog/text';
import { isExternal } from '../../../../lib/properties/images';
import { listingHref, parseListingFilters } from '../../../../lib/properties/listing-filters';
import { featuredListings, findListing, similarListings } from '../../../../lib/properties/queries';
import { OPERATION_OPTIONS } from '../../../../lib/properties/search-params';
import type { ListingDetail } from '../../../../lib/properties/view';
import { realEstateListingSchema } from '../../../../lib/seo/json-ld';
import { buildMetadata, withBrand } from '../../../../lib/seo/metadata';
import { routes } from '../../../../lib/seo/routes';
import { getSiteUrl } from '../../../../lib/site-url';
import { whatsappHref } from '../../../../lib/whatsapp';

// ISR on-demand (ADR 0011): cada ficha se genera en su primera visita (el build corre sin base) y
// queda cacheada hasta que apps/gestion avisa que la propiedad cambió (ADR 0023).
export function generateStaticParams(): { slug: string }[] {
  return [];
}

type Props = PageProps<'/propiedades/[slug]'>;

const SIMILAR_COUNT = 3;

async function lookup(params: Props['params']) {
  return findListing(decodeURIComponent((await params).slug));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await lookup(params);
  if (found.kind === 'not_found') return {};
  if (found.kind === 'not_listed') {
    return { title: 'Propiedad no disponible', robots: { index: false, follow: true } };
  }
  const { listing } = found;
  const cover = listing.photos[0];
  return buildMetadata({
    title: withBrand(`${listing.title} · ${listing.priceLabel}`),
    description:
      summarize(listing.description) ||
      `${listing.propertyTypeLabel} en ${listing.operationLabel.toLowerCase()} en ${listing.location}.`,
    path: listing.href,
    ...(cover &&
      !isExternal(cover.src) && {
        image: {
          url: cover.src,
          ...(cover.width !== null && { width: cover.width }),
          ...(cover.height !== null && { height: cover.height }),
          alt: cover.alt,
        },
      }),
  });
}

export default async function PropertyPage({ params }: Props) {
  const found = await lookup(params);
  if (found.kind === 'not_found') notFound();
  if (found.kind === 'not_listed') return <NotListed />;

  const { listing } = found;
  const similar = await similarListings(
    listing.id,
    listing.operation,
    listing.propertyType,
    SIMILAR_COUNT,
  );
  const operationParam = OPERATION_OPTIONS.find((o) => o.value === listing.operation)?.param;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-8">
      <JsonLdScript data={realEstateListingSchema(getSiteUrl(), listing)} />
      <Breadcrumbs
        items={[
          { name: 'Inicio', path: routes.home() },
          {
            name: `Propiedades en ${listing.operationLabel.toLowerCase()}`,
            path: listingHref(parseListingFilters({ operacion: operationParam })),
          },
          { name: listing.title, path: listing.href },
        ]}
      />

      <div className="mt-5">
        <PropertyGallery title={listing.title} photos={listing.photos} />
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_24rem]">
        <div className="min-w-0 space-y-10">
          <PropertySummary listing={listing} />
          {listing.description.trim() !== '' && (
            <section aria-labelledby="description-title">
              <h2 id="description-title" className="text-xl font-extrabold">
                Descripción
              </h2>
              <p className="text-foreground/90 mt-3 leading-relaxed whitespace-pre-line">
                {listing.description}
              </p>
            </section>
          )}
          <PropertyAttributes listing={listing} />
          <PropertyMedia listing={listing} />
          {listing.coordinates && (
            <section aria-labelledby="map-title">
              <h2 id="map-title" className="text-xl font-extrabold">
                Ubicación
              </h2>
              <p className="text-muted-foreground mt-1 mb-4 flex items-center gap-1.5 text-sm">
                <MapPin aria-hidden className="size-4" />
                {listing.coordinates.exact
                  ? (listing.address ?? listing.location)
                  : `Ubicación aproximada · ${listing.location}`}
              </p>
              <PropertyMap
                latitude={listing.coordinates.latitude}
                longitude={listing.coordinates.longitude}
                exact={listing.coordinates.exact}
                label={`Mapa de ${listing.title}`}
              />
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <ContactCard listing={listing} />
        </aside>
      </div>

      {similar.length > 0 && (
        <section aria-labelledby="similar-title" className="mt-20">
          <SectionHeading
            id="similar-title"
            title="Propiedades similares"
            link={{
              href: listingHref(parseListingFilters({ operacion: operationParam })),
              label: 'Ver más',
            }}
          />
          <div className="mt-8">
            <ListingGrid listings={similar} />
          </div>
        </section>
      )}
    </div>
  );
}

function PropertySummary({ listing }: { readonly listing: ListingDetail }) {
  return (
    <section aria-labelledby="property-title" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="bg-brand-600 rounded-lg px-2.5 py-1 text-xs font-bold text-white">
          {listing.operationLabel}
        </span>
        <span className="bg-muted rounded-lg px-2.5 py-1 text-xs font-bold">
          {listing.propertyTypeLabel}
        </span>
        {listing.featured && (
          <span className="bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 rounded-lg px-2.5 py-1 text-xs font-bold">
            Destacada
          </span>
        )}
      </div>
      <h1 id="property-title" className="text-3xl leading-tight font-extrabold sm:text-4xl">
        {listing.title}
      </h1>
      <p className="text-muted-foreground flex items-center gap-1.5">
        <MapPin aria-hidden className="size-4 shrink-0" />
        {listing.address ? `${listing.address} · ${listing.location}` : listing.location}
      </p>
      <div>
        <p className="text-3xl font-extrabold tracking-tight">{listing.priceLabel}</p>
        {listing.expensesLabel && (
          <p className="text-muted-foreground text-sm">{listing.expensesLabel}</p>
        )}
        {listing.otherOperations.map((other) => (
          <p key={other.label} className="text-muted-foreground text-sm">
            {other.label}: <span className="text-foreground font-semibold">{other.value}</span>
          </p>
        ))}
      </div>
      {listing.facts.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {listing.facts.map((fact) => (
            <li
              key={fact.kind}
              className="bg-card rounded-xl border px-3.5 py-2 text-sm font-semibold"
            >
              {fact.label}
            </li>
          ))}
        </ul>
      )}
      <div aria-hidden className="deco-steps" />
    </section>
  );
}

function PropertyAttributes({ listing }: { readonly listing: ListingDetail }) {
  if (listing.attributes.length === 0 && listing.featureGroups.length === 0) return null;
  return (
    <section aria-labelledby="attributes-title" className="space-y-6">
      <h2 id="attributes-title" className="text-xl font-extrabold">
        Características
      </h2>
      {listing.attributes.length > 0 && (
        <dl className="grid gap-x-8 sm:grid-cols-2">
          {listing.attributes.map((attribute) => (
            <div
              key={attribute.label}
              className="flex justify-between gap-4 border-b border-dashed py-2.5 text-sm"
            >
              <dt className="text-muted-foreground">{attribute.label}</dt>
              <dd className="text-right font-semibold">{attribute.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {listing.featureGroups.map((group) => (
        <div key={group.label}>
          <h3 className="text-sm font-bold">{group.label}</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {group.names.map((name) => (
              <li key={name} className="bg-muted rounded-full px-3 py-1.5 text-sm">
                {name}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function PropertyMedia({ listing }: { readonly listing: ListingDetail }) {
  const links = [
    ...listing.videoUrls.map((url, i) => ({
      url,
      label: `Ver el video ${i + 1}`,
      Icon: PlayCircle,
    })),
    ...listing.tourUrls.map((url, i) => ({
      url,
      label: `Recorrido 360° ${i + 1}`,
      Icon: Rotate3d,
    })),
  ];
  if (listing.floorPlans.length === 0 && links.length === 0) return null;
  return (
    <section aria-labelledby="media-title" className="space-y-4">
      <h2 id="media-title" className="text-xl font-extrabold">
        Planos y videos
      </h2>
      {listing.floorPlans.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {listing.floorPlans.map((plan) => (
            <li
              key={plan.src}
              className="bg-card relative aspect-[4/3] overflow-hidden rounded-2xl border"
            >
              <a href={plan.src} target="_blank" rel="noopener noreferrer" aria-label={plan.alt}>
                <Image
                  src={plan.src}
                  alt={plan.alt}
                  fill
                  sizes="(min-width: 640px) 40vw, 100vw"
                  unoptimized={isExternal(plan.src)}
                  className="object-contain p-2"
                />
              </a>
            </li>
          ))}
        </ul>
      )}
      {links.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {links.map(({ url, label, Icon }) => (
            <li key={url}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:bg-muted inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors"
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ContactCard({ listing }: { readonly listing: ListingDetail }) {
  const whatsapp = whatsappHref(
    `Hola, me interesa la propiedad ${listing.code}: ${listing.title}. ${getSiteUrl()}${listing.href}`,
  );
  const formEnabled = getContainer().inquiries !== undefined;

  return (
    <div className="bg-card space-y-4 rounded-3xl border p-5 sm:p-6">
      <div>
        <p className="text-lg font-extrabold">¿Te interesa esta propiedad?</p>
        <p className="text-muted-foreground text-sm">Código {listing.code}</p>
      </div>
      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-whatsapp flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
        >
          <WhatsAppIcon className="size-5" />
          Consultar por WhatsApp
        </a>
      )}
      {formEnabled && (
        <>
          {whatsapp && (
            <p className="text-muted-foreground text-center text-xs font-semibold">
              o dejanos tus datos
            </p>
          )}
          <InquiryForm propertyId={listing.id} propertyTitle={listing.title} />
        </>
      )}
      {!whatsapp && !formEnabled && (
        <p className="text-muted-foreground text-sm">Muy pronto vas a poder consultar desde acá.</p>
      )}
    </div>
  );
}

/** La propiedad existe pero ya no se ofrece: se avisa y se sugieren otras. */
async function NotListed() {
  const others = await featuredListings(SIMILAR_COUNT);
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <div className="max-w-2xl space-y-4">
        <p className="text-muted-foreground text-sm font-semibold">Propiedad no disponible</p>
        <h1 className="text-3xl font-extrabold sm:text-4xl">
          Esta propiedad ya no está disponible
        </h1>
        <p className="text-muted-foreground">
          Puede que se haya vendido, alquilado o reservado. Mirá otras opciones parecidas.
        </p>
        <Link
          href={routes.properties()}
          className="bg-primary text-primary-foreground hover:bg-primary-700 inline-flex h-11 items-center rounded-xl px-6 text-sm font-bold transition-colors"
        >
          Ver todas las propiedades
        </Link>
      </div>
      {others.length > 0 && (
        <div className="mt-14">
          <ListingGrid listings={others} />
        </div>
      )}
    </div>
  );
}
