import type { Tour } from './tour';

// Un recorrido por pantalla principal, pensado para quien empieza en Norde. Los pasos cuyo
// elemento no está (sin permiso, sin datos, otra vista o mobile) se saltean solos.

const home: Tour = {
  paths: ['/'],
  steps: [
    {
      title: 'Te damos la bienvenida al panel',
      description:
        'Este es Inicio: lo primero que ves al entrar. Te mostramos cómo moverte por el panel y qué tenés pendiente.',
    },
    {
      target: 'shell-nav',
      title: 'El menú',
      description:
        'Desde acá entrás a cada sección: oportunidades, contactos, consultas, propiedades, emprendimientos, tasaciones, reservas y difusión.',
      side: 'right',
    },
    {
      target: 'shell-search',
      title: 'Buscador',
      description:
        'Buscá un contacto, una propiedad, un emprendimiento o un agente desde cualquier pantalla, por nombre, código o teléfono.',
    },
    {
      target: 'shell-notifications',
      title: 'Avisos',
      description:
        'La campana te avisa cuando te asignan algo y muestra los procesos en curso, como importaciones o exportaciones.',
    },
    {
      target: 'shell-help',
      title: 'Tutoriales',
      description:
        'En cada pantalla principal, este botón te muestra su tutorial. Usalo cada vez que tengas una duda.',
    },
    {
      target: 'shell-account',
      title: 'Tu cuenta',
      description: 'Tus datos, tu contraseña y el botón para salir.',
    },
    {
      target: 'home-view',
      title: 'Dos vistas',
      description:
        '"Pendientes" muestra lo que hay que hacer hoy; "Estado actual" resume la cartera y los clientes.',
    },
    {
      target: 'home-filters',
      title: 'Filtrar por agente o sucursal',
      description: 'Mirá el inicio de otro agente o de una sucursal.',
    },
    {
      target: 'home-pending',
      title: 'Tus pendientes',
      description:
        'Consultas sin asignar, contactos por llamar, firmas próximas y avisos con problemas. Tocá uno para ver su lista.',
    },
    {
      target: 'home-pending-list',
      title: 'La lista del pendiente',
      description:
        'Cada fila tiene botones para escribir por WhatsApp o llamar sin salir de la pantalla.',
      side: 'top',
    },
    {
      target: 'home-kpis',
      title: 'Indicadores',
      description:
        'Cuántos clientes tienen una oportunidad abierta y cuántas propiedades están disponibles.',
    },
  ],
};

const news: Tour = {
  paths: ['/noticias'],
  steps: [
    {
      title: 'Noticias',
      description:
        'Un resumen de lo que pasó en la inmobiliaria: propiedades nuevas, bajas de precio, contactos y reservas.',
    },
    {
      target: 'news-period',
      title: 'Período',
      description: 'Elegí si querés ver lo de hoy, lo de ayer o lo de la semana.',
    },
    {
      target: 'news-kinds',
      title: 'Qué noticias ver',
      description: 'Elegí los tipos de noticias que te interesan; el resto se oculta.',
    },
    {
      target: 'news-summary',
      title: 'Resumen',
      description: 'Los números del período y la actividad de cada día.',
      side: 'top',
    },
  ],
};

const opportunities: Tour = {
  paths: ['/oportunidades'],
  steps: [
    {
      title: 'Oportunidades',
      description:
        'Una oportunidad es un cliente buscando algo concreto. Acá seguís cada una desde que entra hasta que se gana o se pierde.',
    },
    {
      target: 'opportunities-view',
      title: 'Lista o tablero',
      description:
        'La lista agrupa por estado; el tablero muestra columnas y podés arrastrar cada tarjeta para cambiarle el estado.',
    },
    {
      target: 'opportunities-stages',
      title: 'Estados',
      description:
        'Cuántas oportunidades hay en cada estado. Tocá uno para ir a esa parte de la lista.',
    },
    {
      target: 'opportunities-filters',
      title: 'Filtros',
      description:
        'Buscá por contacto, categoría o canal de origen. En "Más filtros y orden" están el agente, la sucursal y el orden.',
    },
    {
      target: 'opportunities-list',
      title: 'Las oportunidades',
      description:
        'Abrí un estado para ver sus oportunidades. Cada fila tiene acciones rápidas y un menú para avanzar, reasignar o cerrar.',
      side: 'top',
    },
    {
      target: 'opportunities-board',
      title: 'El tablero',
      description: 'Arrastrá una tarjeta a otra columna para cambiarle el estado.',
      side: 'top',
    },
  ],
};

const clients: Tour = {
  paths: ['/contactos'],
  steps: [
    {
      title: 'Contactos',
      description:
        'Todas las personas con las que trabaja Norde: clientes, propietarios e interesados.',
    },
    {
      target: 'clients-view',
      title: 'Grilla o agenda',
      description: 'La grilla muestra todos los datos; la agenda los ordena de la A a la Z.',
    },
    {
      target: 'clients-data',
      title: 'Importar y exportar',
      description:
        'Importá contactos desde un Excel o exportá a Excel los que estás viendo, con los filtros aplicados.',
    },
    {
      target: 'clients-new',
      title: 'Nuevo contacto',
      description:
        'Cargá un contacto nuevo. Si el teléfono ya existe, el panel te avisa para no duplicarlo.',
    },
    {
      target: 'clients-filters',
      title: 'Filtros',
      description:
        'Buscá por nombre, teléfono o email y filtrá por tipo o etiquetas. En "Más filtros" está la papelera.',
    },
    {
      target: 'clients-grid',
      title: 'El listado',
      description: 'Tocá un contacto para abrir su ficha.',
      side: 'top',
    },
  ],
};

const clientDetail: Tour = {
  paths: ['/contactos/:id'],
  steps: [
    {
      target: 'client-header',
      title: 'La ficha del contacto',
      description: 'Sus datos principales, su agente y si lo marcaste como favorito.',
    },
    {
      target: 'client-contact',
      title: 'Contactarlo',
      description:
        'Escribile por WhatsApp, llamalo o mandale un email con un toque. Si tiene una oportunidad abierta, la manejás desde acá.',
    },
    {
      target: 'client-actions',
      title: 'Acciones',
      description: 'Editar, reasignar a otro agente, unificar duplicados o mandarlo a la papelera.',
    },
    {
      target: 'client-tabs',
      title: 'Secciones',
      description:
        'Actividad, oportunidades, propiedades destacadas, envíos, búsquedas e historial de cambios. Cada pestaña muestra una parte del contacto.',
    },
    {
      target: 'client-note',
      title: 'Notas',
      description:
        'Anotá cada llamada, visita o charla: queda en la actividad del contacto para todo el equipo.',
      side: 'top',
    },
  ],
};

const inquiries: Tour = {
  paths: ['/consultas'],
  steps: [
    {
      title: 'Consultas',
      description:
        'Los mensajes que llegan desde la web, los portales y el agente de IA, antes de convertirse en oportunidades.',
    },
    {
      target: 'inquiries-status',
      title: 'Estados',
      description:
        'Pendientes son las que nadie tomó todavía; asignadas, las que ya tienen agente; borradas, las descartadas.',
    },
    {
      target: 'inquiries-rules',
      title: 'Reglas de asignación',
      description: 'Definí a qué agente le llega cada consulta automáticamente.',
    },
    {
      target: 'inquiries-filters',
      title: 'Filtros',
      description: 'Filtrá por canal, propiedad, sucursal o fecha de llegada.',
    },
    {
      target: 'inquiries-list',
      title: 'Las consultas',
      description:
        'Cada consulta muestra quién escribió y por qué propiedad. Asignala a un agente para que la atienda.',
      side: 'top',
    },
  ],
};

const properties: Tour = {
  paths: ['/propiedades'],
  steps: [
    {
      title: 'Propiedades',
      description: 'La cartera de Norde: borradores, disponibles, reservadas y cerradas.',
    },
    {
      target: 'properties-view',
      title: 'Lista, tarjetas o mapa',
      description: 'Elegí cómo ver las propiedades. El mapa sirve para buscar por zona.',
    },
    {
      target: 'properties-favorites',
      title: 'Búsquedas favoritas',
      description: 'Guardá los filtros que usás seguido y volvé a ellos con un clic.',
    },
    {
      target: 'properties-save-search',
      title: 'Guardar para un contacto',
      description:
        'Guardá la búsqueda en un contacto: el panel le avisa cuando entre una propiedad que le sirva.',
    },
    {
      target: 'properties-import',
      title: 'Importar',
      description: 'Traé propiedades desde Tokko.',
    },
    {
      target: 'properties-new',
      title: 'Nueva propiedad',
      description: 'Cargá una propiedad. Arranca como borrador hasta que la marques disponible.',
    },
    {
      target: 'properties-filters',
      title: 'Filtros',
      description:
        'Buscá por código o título y filtrá por ubicación, operación, tipo, estado y precio.',
    },
    {
      target: 'properties-grid',
      title: 'El listado',
      description:
        'Tocá una fila para un vistazo rápido; tocá el código para abrir la ficha. Seleccioná varias para las acciones masivas.',
      side: 'top',
    },
  ],
};

const propertyDetail: Tour = {
  paths: ['/propiedades/:id'],
  steps: [
    {
      target: 'property-header',
      title: 'La ficha de la propiedad',
      description: 'Foto, código, dirección, precio y estado de la propiedad.',
    },
    {
      target: 'property-reserve',
      title: 'Reservar',
      description: 'Registrá una reserva a nombre de un contacto.',
    },
    {
      target: 'property-status',
      title: 'Cambiar estado',
      description: 'Pasala de borrador a disponible, o marcala como cerrada o suspendida.',
    },
    {
      target: 'property-publication',
      title: 'Publicación',
      description:
        'Qué se muestra en la web: si se publica, el precio, la dirección y si es destacada.',
    },
    {
      target: 'property-more',
      title: 'Más acciones',
      description: 'Estadísticas, etiquetas, destacarla a un contacto y descargar la ficha en PDF.',
    },
    {
      target: 'property-tabs',
      title: 'Secciones',
      description:
        'Detalles, fotos y videos, archivos, contactos interesados, reservas, estadísticas, difusión en portales e historial de cambios.',
    },
  ],
};

const developments: Tour = {
  paths: ['/emprendimientos'],
  steps: [
    {
      title: 'Emprendimientos',
      description: 'Los desarrollos en pozo o en construcción, con sus unidades.',
    },
    {
      target: 'developments-view',
      title: 'Lista o mapa',
      description: 'Elegí cómo ver los emprendimientos.',
    },
    {
      target: 'developments-new',
      title: 'Nuevo emprendimiento',
      description: 'Cargá un emprendimiento; después le agregás las unidades desde su ficha.',
    },
    {
      target: 'developments-filters',
      title: 'Buscar',
      description: 'Buscá por código, nombre, dirección o desarrollista.',
    },
    {
      target: 'developments-grid',
      title: 'El listado',
      description: 'Tocá un emprendimiento para abrir su ficha.',
      side: 'top',
    },
  ],
};

const developmentDetail: Tour = {
  paths: ['/emprendimientos/:id'],
  steps: [
    {
      target: 'development-header',
      title: 'La ficha del emprendimiento',
      description: 'Nombre, dirección y estado del emprendimiento.',
    },
    {
      target: 'development-status',
      title: 'Cambiar estado',
      description: 'Actualizá la etapa del emprendimiento.',
    },
    {
      target: 'development-more',
      title: 'Más acciones',
      description: 'Etiquetas y borrar el emprendimiento.',
    },
    {
      target: 'development-tabs',
      title: 'Secciones',
      description:
        'En "Unidades" cargás e importás las unidades; también tenés fotos, archivos, derivación de interesados, difusión e historial.',
    },
  ],
};

const appraisals: Tour = {
  paths: ['/tasaciones'],
  steps: [
    {
      title: 'Tasaciones',
      description:
        'Las tasaciones que hace Norde. Una tasación aceptada se puede convertir en propiedad.',
    },
    {
      target: 'appraisals-new',
      title: 'Nueva tasación',
      description: 'Cargá los datos del inmueble y del propietario para tasarlo.',
    },
    {
      target: 'appraisals-filters',
      title: 'Filtros',
      description: 'Filtrá por estado, tipo de propiedad y más.',
    },
    {
      target: 'appraisals-grid',
      title: 'El listado',
      description: 'Tocá una tasación para abrir su ficha.',
      side: 'top',
    },
  ],
};

const appraisalDetail: Tour = {
  paths: ['/tasaciones/:id'],
  steps: [
    {
      target: 'appraisal-header',
      title: 'La ficha de la tasación',
      description: 'El inmueble tasado y en qué estado está la tasación.',
    },
    {
      target: 'appraisal-status',
      title: 'Cambiar estado',
      description: 'Avanzá la tasación a medida que se trabaja.',
    },
    {
      target: 'appraisal-pdf',
      title: 'Descargar PDF',
      description: 'El informe de tasación listo para mandarle al propietario.',
    },
    {
      target: 'appraisal-convert',
      title: 'Convertir en propiedad',
      description:
        'Si el propietario acepta, la tasación pasa a la cartera como propiedad, con sus fotos.',
    },
    {
      target: 'appraisal-tabs',
      title: 'Secciones',
      description: 'Los datos del inmueble, el resultado de la tasación, las fotos y el historial.',
    },
  ],
};

const reservations: Tour = {
  paths: ['/reservas'],
  steps: [
    {
      title: 'Reservas',
      description:
        'Todas las reservas de propiedades. Una reserva nueva se carga con "Reservar" en la ficha de la propiedad.',
    },
    {
      target: 'reservations-print',
      title: 'Imprimir',
      description: 'Imprimí el listado tal como lo estás viendo.',
    },
    {
      target: 'reservations-export',
      title: 'Exportar',
      description: 'Descargá las reservas a Excel, con los filtros aplicados.',
    },
    {
      target: 'reservations-filters',
      title: 'Filtros',
      description: 'Filtrá por estado de la reserva, operación y tipo de propiedad.',
    },
    {
      target: 'reservations-grid',
      title: 'El listado',
      description: 'Tocá una reserva para abrir la ficha de su propiedad.',
      side: 'top',
    },
  ],
};

const publications: Tour = {
  paths: ['/difusion'],
  steps: [
    {
      title: 'Difusión',
      description: 'Dónde se publica cada propiedad: el sitio web y los portales inmobiliarios.',
    },
    {
      target: 'publications-summary',
      title: 'Resumen',
      description: 'Cuántas propiedades faltan difundir y cuántas están en el sitio web.',
    },
    {
      target: 'publications-counters',
      title: 'Estado en cada portal',
      description:
        'Publicadas, pendientes y con problemas. Tocá un número para ver esas publicaciones.',
    },
    {
      target: 'publications-portal-link',
      title: 'Publicaciones del portal',
      description: 'El detalle de todo lo publicado en ese portal.',
    },
  ],
};

export const PANEL_TOURS: readonly Tour[] = [
  home,
  news,
  opportunities,
  clients,
  clientDetail,
  inquiries,
  properties,
  propertyDetail,
  developments,
  developmentDetail,
  appraisals,
  appraisalDetail,
  reservations,
  publications,
];
