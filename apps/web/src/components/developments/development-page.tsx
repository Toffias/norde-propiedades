import { WhatsAppIcon } from '@norde/ui/components/whatsapp-icon';
import { MapPin, PlayCircle, Rotate3d } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getContainer } from '../../container';
import { summarize } from '../../lib/blog/text';
import {
  developmentUnits,
  findDevelopment,
  searchDevelopments,
} from '../../lib/developments/queries';
import type { DevelopmentDetailView } from '../../lib/developments/view';
import { isExternal } from '../../lib/properties/images';
import { developmentListingSchema } from '../../lib/seo/json-ld';
import { buildMetadata, withBrand } from '../../lib/seo/metadata';
import { routes } from '../../lib/seo/routes';
import { getSiteUrl } from '../../lib/site-url';
import { whatsappHref } from '../../lib/whatsapp';
import { Pagination } from '../blog/pagination';
import { InquiryForm } from '../properties/inquiry-form';
import { ListingGrid } from '../properties/listing-card';
import { PropertyGallery } from '../properties/property-gallery';
import { PropertyMap } from '../properties/property-map';
import { Breadcrumbs } from '../seo/breadcrumbs';
import { JsonLdScript } from '../seo/json-ld-script';
import { DevelopmentGrid } from './development-card';

// La ficha de un emprendimiento con una página de sus unidades. La página 1 es la ficha
// (`/emprendimientos/<slug>`); las siguientes, `/emprendimientos/<slug>/pagina/<n>`.

const OTHERS_COUNT = 3;

export async function developmentMetadata(slug: string, page: number): Promise<Metadata> {
  const found = await findDevelopment(slug);
  if (found.kind === 'not_found') return {};
  if (found.kind === 'not_listed') {
    return { title: 'Emprendimiento no disponible', robots: { index: false, follow: true } };
  }
  const { development } = found;
  const cover = development.photos[0];
  const suffix = page > 1 ? ` · unidades, página ${page}` : '';
  const place = development.location === '' ? '' : ` en ${development.location}`;
  return buildMetadata({
    title: withBrand(`${development.name}${suffix}`),
    description:
      summarize(development.description) ||
      `${development.typeLabel ?? 'Emprendimiento'}${place}: ${development.unitsLabel.toLowerCase()}.`,
    path: routes.developmentPage(development.slug, page),
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

export async function DevelopmentPage({
  slug,
  page,
}: {
  readonly slug: string;
  readonly page: number;
}) {
  const found = await findDevelopment(slug);
  if (found.kind === 'not_found') notFound();
  if (found.kind === 'not_listed') return <NotListed />;

  const { development } = found;
  const units = await developmentUnits(development.id, page);
  // Una página de unidades que ya no existe (se vendieron) no se sirve.
  if (page > units.totalPages) notFound();

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-8">
      <JsonLdScript data={developmentListingSchema(getSiteUrl(), development)} />
      <Breadcrumbs
        items={[
          { name: 'Inicio', path: routes.home() },
          { name: 'Emprendimientos', path: routes.developments() },
          { name: development.name, path: routes.developmentPage(development.slug, page) },
        ]}
      />

      {development.photos.length > 0 && (
        <div className="mt-5">
          <PropertyGallery title={development.name} photos={development.photos} />
        </div>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_24rem]">
        <div className="min-w-0 space-y-10">
          <Summary development={development} />
          {development.description.trim() !== '' && (
            <section aria-labelledby="description-title">
              <h2 id="description-title" className="text-xl font-extrabold">
                Descripción
              </h2>
              <p className="text-foreground/90 mt-3 leading-relaxed whitespace-pre-line">
                {development.description}
              </p>
            </section>
          )}
          <Attributes development={development} />
          <Media development={development} />
          {development.coordinates && (
            <section aria-labelledby="map-title">
              <h2 id="map-title" className="text-xl font-extrabold">
                Ubicación
              </h2>
              <p className="text-muted-foreground mt-1 mb-4 flex items-center gap-1.5 text-sm">
                <MapPin aria-hidden className="size-4" />
                {`Ubicación aproximada · ${development.location}`}
              </p>
              <PropertyMap
                latitude={development.coordinates.latitude}
                longitude={development.coordinates.longitude}
                exact={false}
                label={`Mapa de ${development.name}`}
              />
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <ContactCard development={development} />
        </aside>
      </div>

      <section aria-labelledby="units-title" className="mt-20 scroll-mt-28" id="unidades">
        <h2 id="units-title" className="text-2xl font-extrabold sm:text-3xl">
          Unidades disponibles
        </h2>
        <p className="text-muted-foreground mt-2">
          {units.total === 0
            ? 'Todavía no hay unidades publicadas. Consultanos por la disponibilidad y los precios.'
            : units.total === 1
              ? '1 unidad publicada.'
              : `${units.total} unidades publicadas, de la más económica a la más cara.`}
        </p>
        {units.items.length > 0 && (
          <div className="mt-8">
            <ListingGrid listings={units.items} />
          </div>
        )}
        <Pagination
          current={units.page}
          total={units.totalPages}
          hrefFor={(n) => `${routes.developmentPage(development.slug, n)}#unidades`}
        />
      </section>
    </div>
  );
}

function Summary({ development }: { readonly development: DevelopmentDetailView }) {
  return (
    <section aria-labelledby="development-title" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {development.constructionLabel && (
          <span className="bg-brand-600 rounded-lg px-2.5 py-1 text-xs font-bold text-white">
            {development.constructionLabel}
          </span>
        )}
        {development.typeLabel && (
          <span className="bg-muted rounded-lg px-2.5 py-1 text-xs font-bold">
            {development.typeLabel}
          </span>
        )}
      </div>
      <h1 id="development-title" className="text-3xl leading-tight font-extrabold sm:text-4xl">
        {development.name}
      </h1>
      <p className="text-muted-foreground flex items-center gap-1.5">
        <MapPin aria-hidden className="size-4 shrink-0" />
        {development.address
          ? `${development.address} · ${development.location}`
          : development.location}
      </p>
      <div>
        <p className="text-3xl font-extrabold tracking-tight">
          {development.priceFromLabel ?? 'Consultar precios'}
        </p>
        <p className="text-muted-foreground text-sm">{development.unitsLabel}</p>
      </div>
      {development.deliveryLabel && (
        <ul className="flex flex-wrap gap-2">
          <li className="bg-card rounded-xl border px-3.5 py-2 text-sm font-semibold">
            {development.deliveryLabel}
          </li>
        </ul>
      )}
      <div aria-hidden className="deco-steps" />
    </section>
  );
}

function Attributes({ development }: { readonly development: DevelopmentDetailView }) {
  if (
    development.attributes.length === 0 &&
    development.featureGroups.length === 0 &&
    development.financingDetails === null
  ) {
    return null;
  }
  return (
    <section aria-labelledby="attributes-title" className="space-y-6">
      <h2 id="attributes-title" className="text-xl font-extrabold">
        Características
      </h2>
      {development.attributes.length > 0 && (
        <dl className="grid gap-x-8 sm:grid-cols-2">
          {development.attributes.map((attribute) => (
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
      {development.financingDetails && (
        <div>
          <h3 className="text-sm font-bold">Formas de pago</h3>
          <p className="text-foreground/90 mt-2 text-sm leading-relaxed whitespace-pre-line">
            {development.financingDetails}
          </p>
        </div>
      )}
      {development.featureGroups.map((group) => (
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

function Media({ development }: { readonly development: DevelopmentDetailView }) {
  const links = [
    ...development.videoUrls.map((url, i) => ({
      url,
      label: `Ver el video ${i + 1}`,
      Icon: PlayCircle,
    })),
    ...development.tourUrls.map((url, i) => ({
      url,
      label: `Recorrido 360° ${i + 1}`,
      Icon: Rotate3d,
    })),
  ];
  if (development.floorPlans.length === 0 && links.length === 0) return null;
  return (
    <section aria-labelledby="media-title" className="space-y-4">
      <h2 id="media-title" className="text-xl font-extrabold">
        Planos y videos
      </h2>
      {development.floorPlans.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {development.floorPlans.map((plan) => (
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

function ContactCard({ development }: { readonly development: DevelopmentDetailView }) {
  const whatsapp = whatsappHref(
    `Hola, me interesa el emprendimiento ${development.code}: ${development.name}. ${getSiteUrl()}${development.href}`,
  );
  const formEnabled = getContainer().inquiries !== undefined;

  return (
    <div className="bg-card space-y-4 rounded-3xl border p-5 sm:p-6">
      <div>
        <p className="text-lg font-extrabold">¿Te interesa este emprendimiento?</p>
        <p className="text-muted-foreground text-sm">Código {development.code}</p>
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
          <InquiryForm
            defaultMessage={`Hola, me interesa el emprendimiento "${development.name}" (${development.code}). ¿Me pasan unidades disponibles y formas de pago?`}
          />
        </>
      )}
      {!whatsapp && !formEnabled && (
        <p className="text-muted-foreground text-sm">Muy pronto vas a poder consultar desde acá.</p>
      )}
    </div>
  );
}

/** El emprendimiento existe pero no se ofrece: se avisa y se sugieren otros. */
async function NotListed() {
  const others = await searchDevelopments({ sort: 'newest', page: 1 }, OTHERS_COUNT);
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <div className="max-w-2xl space-y-4">
        <p className="text-muted-foreground text-sm font-semibold">Emprendimiento no disponible</p>
        <h1 className="text-3xl font-extrabold sm:text-4xl">
          Este emprendimiento ya no está disponible
        </h1>
        <p className="text-muted-foreground">
          Puede que se hayan vendido sus unidades o que ya no lo comercialicemos. Mirá otros
          proyectos.
        </p>
        <Link
          href={routes.developments()}
          className="bg-primary text-primary-foreground hover:bg-primary-700 inline-flex h-11 items-center rounded-xl px-6 text-sm font-bold transition-colors"
        >
          Ver todos los emprendimientos
        </Link>
      </div>
      {others.items.length > 0 && (
        <div className="mt-14">
          <DevelopmentGrid developments={others.items} />
        </div>
      )}
    </div>
  );
}
