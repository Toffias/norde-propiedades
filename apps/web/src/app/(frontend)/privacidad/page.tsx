import type { Metadata } from 'next';

import { Breadcrumbs } from '../../../components/seo/breadcrumbs';
import { BUSINESS } from '../../../constants/business';
import { buildMetadata, withBrand } from '../../../lib/seo/metadata';
import { routes } from '../../../lib/seo/routes';

// Por request: la metadata y las migas usan la URL del sitio, que el build no tiene.
export const dynamic = 'force-dynamic';

const DESCRIPTION = `Cómo ${BUSINESS.name} trata los datos personales que nos dejás en el sitio, el chat y WhatsApp, y cómo ejercer tus derechos de acceso, rectificación y supresión.`;

/** Fecha de la última versión del texto: se actualiza con cada cambio de contenido. */
const LAST_UPDATED = '16 de noviembre de 2026';

const AAIP_URL = 'https://www.argentina.gob.ar/aaip';

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: withBrand('Política de privacidad'),
    description: DESCRIPTION,
    path: routes.privacy(),
  });
}

export default function PrivacyPage() {
  const { address, email, name } = BUSINESS;
  const addressText = address
    ? [address.streetAddress, address.addressLocality, address.addressRegion]
        .filter(Boolean)
        .join(', ')
    : null;
  const contactEmail = email ? (
    <a href={`mailto:${email}`} className="wrap-anywhere">
      {email}
    </a>
  ) : (
    'los canales de contacto del sitio'
  );

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6 sm:pt-8">
      <Breadcrumbs
        items={[
          { name: 'Inicio', path: routes.home() },
          { name: 'Política de privacidad', path: routes.privacy() },
        ]}
      />
      <article className="prose mt-6 max-w-none">
        <h1>Política de privacidad</h1>
        <p className="text-muted-foreground text-sm">Última actualización: {LAST_UPDATED}</p>

        <p>
          En {name} cuidamos los datos personales de quienes nos consultan. Esta política explica
          qué datos recolectamos, para qué los usamos y qué derechos tenés, de acuerdo con la Ley
          25.326 de Protección de los Datos Personales.
        </p>

        <h2>Quién es el responsable</h2>
        <p>
          El responsable de los datos es {BUSINESS.legalName}
          {addressText ? `, con domicilio en ${addressText}` : ''}. Para cualquier consulta sobre
          tus datos, escribinos a {contactEmail}.
        </p>

        <h2>Qué datos recolectamos</h2>
        <ul>
          <li>
            <strong>Formularios del sitio</strong> (consultas por propiedades, pedidos de tasación y
            suscripciones a búsquedas): tu nombre, email, teléfono, el mensaje que nos dejás y la
            propiedad o la búsqueda que te interesa.
          </li>
          <li>
            <strong>WhatsApp</strong>: tu número, tu nombre de perfil y los mensajes, audios e
            imágenes que nos mandás.
          </li>
          <li>
            <strong>Chat del sitio</strong>: los mensajes que escribís y los datos de contacto que
            nos des en la conversación.
          </li>
          <li>
            <strong>Datos técnicos</strong>: la dirección IP, para limitar abusos, y una cookie
            técnica que mantiene abierta tu conversación del chat. Las propiedades que marcás como
            favoritas quedan guardadas solo en tu navegador.
          </li>
        </ul>
        <p>
          No te pedimos datos sensibles. Te pedimos que no nos mandes documentos de identidad ni
          datos bancarios por el chat ni por WhatsApp.
        </p>

        <h2>Para qué los usamos</h2>
        <ul>
          <li>Responder tus consultas y coordinar visitas, tasaciones y operaciones.</li>
          <li>Mandarte propiedades que coinciden con lo que buscás, cuando nos lo pedís.</li>
          <li>Hacer el seguimiento comercial de tu consulta con el asesor asignado.</li>
          <li>Cumplir obligaciones legales y prevenir usos abusivos del sitio.</li>
        </ul>
        <p>No vendemos ni alquilamos tus datos a terceros.</p>

        <h2>Asistente con inteligencia artificial</h2>
        <p>
          El chat del sitio y nuestro WhatsApp tienen un asistente automático, basado en
          inteligencia artificial, que responde las primeras consultas y las deriva a un asesor de
          la inmobiliaria. Tus mensajes se procesan con un proveedor de IA solo para generar esas
          respuestas. Siempre podés pedir hablar con una persona.
        </p>

        <h2>Con quién los compartimos</h2>
        <p>
          Solo con los proveedores que necesitamos para prestar el servicio, que tratan los datos
          por cuenta nuestra: el alojamiento del sitio y de la base de datos, el envío de emails,
          Meta (WhatsApp Business) y el proveedor del asistente de IA. Algunos de ellos guardan los
          datos fuera de la Argentina; en ese caso, exigimos un nivel de protección adecuado.
          También publicamos propiedades en portales inmobiliarios, pero no les compartimos los
          datos de quienes consultan. Podemos entregar datos a una autoridad cuando la ley lo exija.
        </p>

        <h2>Cuánto tiempo los guardamos</h2>
        <p>
          Mientras dure la relación comercial y el tiempo necesario para cumplir obligaciones
          legales. Después, los eliminamos o los anonimizamos.
        </p>

        <h2>Tus derechos</h2>
        <p>
          Podés pedir acceder a tus datos, rectificarlos, actualizarlos o suprimirlos, y dejar de
          recibir nuestros envíos en cualquier momento. Cada email que te mandamos tiene un link
          para darte de baja.
        </p>
        <p>
          El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los
          mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un
          interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley
          N° 25.326. La{' '}
          <a href={AAIP_URL} target="_blank" rel="noopener noreferrer">
            Agencia de Acceso a la Información Pública
          </a>
          , en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender
          las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por
          incumplimiento de las normas vigentes en materia de protección de datos personales.
        </p>

        <h2>Cómo pedir la eliminación de tus datos</h2>
        <p>
          Escribinos a {contactEmail} o por WhatsApp con el asunto «Supresión de datos» e indicanos
          el teléfono o el email con el que nos contactaste. Borramos todos tus datos de nuestros
          sistemas, incluidas las conversaciones por WhatsApp y el chat, y te confirmamos cuando
          esté hecho, dentro de los cinco días hábiles que fija la ley.
        </p>

        <h2>Seguridad</h2>
        <p>
          Guardamos los datos en servidores con acceso restringido al personal de la inmobiliaria,
          con conexiones cifradas, y registramos quién accede a ellos y qué cambia.
        </p>

        <h2>Cambios en esta política</h2>
        <p>
          Si cambiamos esta política, publicamos la nueva versión en esta página con su fecha de
          actualización.
        </p>
      </article>
    </div>
  );
}
