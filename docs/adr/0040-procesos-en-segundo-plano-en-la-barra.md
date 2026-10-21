# ADR 0040: Notificaciones de los procesos en segundo plano en la barra del panel

- **Estado**: aceptada
- **Fecha**: 2026-10-21
- **Relacionada con**: ADR 0020 (variantes y PDF en jobs), ADR 0021 (jobs en `apps/gestion`).

## Contexto

Las fotos, los PDF de la ficha, las importaciones (contactos, propiedades, unidades y usuarios de Tokko), las acciones masivas de oportunidades y las publicaciones en los portales corren en jobs de pg-boss. Nadie sabía qué se estaba procesando ni cuándo terminaba. Después de traer 2.780 fotos de Tokko (#17), las que sube un usuario quedan generando sus variantes un buen rato porque esperan detrás de la cola.

Cada job ya deja su estado en una tabla del negocio: `media_items.processing_status`, `import_jobs`, `opportunity_bulk_operations`, `property_documents` y `portal_listings`. La copia de usuarios de Tokko era la única que no guardaba nada.

## Decisión

- **En la UI se llaman "Notificaciones"** (título, `aria-label` y tooltip de la campana), a pedido del usuario. En el código y en esta decisión siguen siendo procesos en segundo plano (`background-tasks`).

- **Se lee el estado del negocio, no la cola.** Un modelo de lectura de `reporting` (`BackgroundTaskQuery`, como Inicio) junta esas tablas con un `union all` y devuelve los procesos en curso primero, después los terminados del más nuevo al más viejo, paginados con límite. No se leen las tablas internas de pg-boss: su esquema es de la librería, no dice quién pidió cada job ni sobre qué ficha corre, y no guarda el resultado.
- **Las fotos se agrupan** por ficha y por quien las subió: "Generando variantes, 2 de 3". No dicen "Procesando": la foto ya está subida y se leería como que se sigue cargando (pedido del usuario, 2026-10-21). La galería de la ficha usa el mismo texto.
- **Las fotos de una importación van juntas** (pedido del usuario, 2026-10-21): la importación de Tokko por API trae miles, a nombre de `system:import` y repartidas en cientos de fichas, y quien la pidió no veía su avance. Cada foto guarda la importación que la trajo (`media_items.import_id`) y la campana muestra una sola tarea, "Fotos de la importación de Tokko, 1.230 de 4.812", a nombre de quien pidió la importación. Sigue en curso después de que la importación termina, mientras quedan variantes por generar. La migración vincula las fotos ya importadas con la importación por API que corría cuando se crearon.
- **Quién ve qué** (decidido con el usuario el 2026-10-21): cada usuario ve lo que pidió. Con `background-tasks:read-others` (lo tiene el administrador) ve también lo de los demás, lo del sistema (`system:import`) y las publicaciones en los portales, que no tienen quién las pidió. Lo autoriza el caso de uso (`ListBackgroundTasks`, `CountBackgroundTasks`); un actor de sistema no consulta.
- **Los terminados se muestran una semana**, o hasta que quien consulta los limpia. Limpiar es una preferencia de pantalla, como los tipos del buscador: una cookie con la fecha del último terminado que se vio. Los en curso se muestran siempre.
- **La copia de usuarios de Tokko guarda su corrida** en `import_jobs` (`kind = 'tokko_users'`) con el estado, el resumen o el motivo del fallo. Los eventos de antes de este cambio siguen corriendo, sin corrida.
- **Refresco por polling, solo con algo en curso**: el layout cuenta los en curso de quien entra; con algo en curso, la campana vuelve a preguntar cada 15 s cerrada y cada 5 s abierta. Sin nada en curso no pregunta. Una acción que encola un proceso revalida la página, y el layout trae el contador nuevo.
- **Índices** para cada filtro: los en curso por quien los pidió (índices parciales) y los terminados por fecha, en cada tabla. La migración solo agrega índices y el permiso.

## Consecuencias

- Un proceso nuevo aparece en la campana sumando un `select` con las mismas columnas a la query y su texto en la barra. Si no guarda su estado en una tabla, primero tiene que guardarlo (como la copia de usuarios de Tokko).
- El avance es el que guarda cada job (`totals.processed` de las importaciones y las acciones masivas). Los PDF y las publicaciones no tienen avance, solo estado.
- La campana no dice la posición en la cola: "en espera" o "procesando" según la tabla. Con "Todos", el administrador ve qué tiene la cola delante (por ejemplo, las fotos de una importación de Tokko).
- Limpiar los terminados vale para ese navegador, no para el usuario en todos sus dispositivos.
- Cambiar la velocidad o la concurrencia de los workers queda fuera de esta decisión.
