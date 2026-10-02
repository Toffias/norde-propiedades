# Glosario de negocio

Términos del negocio inmobiliario tal como los usa Norde, con su nombre en el código y su equivalente en Tokko Broker. Se mantiene con la skill `norde-negocio`: si un término aparece en una conversación, una issue o un documento y no está acá, se agrega.

> Regla: un término = un significado. Si el mismo nombre se usa para dos cosas (como "destacada"), se aclara acá y en el código se usan nombres distintos.

## Personas y roles

| Término              | En el código      | En Tokko                      | Significado                                                                                                 |
| -------------------- | ----------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Cliente              | `Client`          | Contacto                      | Persona, empresa o grupo con quien Norde tiene relación. Es uno solo aunque haya llegado por varios canales |
| Tipo de cliente      | `clientType`      | Etiquetas de tipo             | Comprador, inquilino, propietario vendedor, propietario que alquila, inversor. Puede tener más de uno       |
| Propietario          | `owner`           | Propietario                   | Cliente dueño de una propiedad de la cartera. Sus datos de contacto son sensibles: se ven con permiso       |
| Agente / asesor      | `agent` (usuario) | Agente                        | Usuario responsable comercial de un cliente u oportunidad                                                   |
| Productor / captador | `producer`        | Productor                     | Agente que consiguió la propiedad para la cartera                                                           |
| Tasador              | `appraiser`       | Tasador                       | Usuario que hace la tasación                                                                                |
| Gerente              | rol               | Gerente / Gerente de reservas | Supervisa agentes, reasigna y aprueba reservas                                                              |
| Sucursal             | `Branch`          | Sucursal                      | Oficina de Norde, con sus datos de contacto para portales y PDF                                             |
| Equipo               | `Team`            | Equipo                        | Grupo de usuarios de una sucursal. Puede tener un prefijo exclusivo de códigos de referencia                |
| Inmobiliaria socia   | —                 | Colega (Red Tokko)            | Otra inmobiliaria a la que Norde deriva clientes que no puede atender                                       |

## Comercial

| Término                               | En el código                | En Tokko               | Significado                                                                                              |
| ------------------------------------- | --------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------- |
| Oportunidad                           | `Opportunity`               | Estado del contacto    | Interés concreto de un cliente ("alquilar 2 ambientes en Palermo"). Un cliente puede tener varias        |
| Estado de oportunidad                 | `OpportunityStatus`         | Estado de oportunidad  | Nuevo, contactado, visitando, negociando, ganada, perdida, aplica a otra inmobiliaria                    |
| Aplica a otra inmobiliaria            | `referred_to_partner`       | —                      | Norde no tiene qué ofrecerle; se revisa si una inmobiliaria socia puede                                  |
| Canal de origen                       | `ContactChannel`            | Origen (etiqueta)      | Por dónde llegó el cliente: WhatsApp, web chat, formulario web, portal, referido, llamada, oficina       |
| Consulta                              | `Inquiry`                   | Consulta               | Mensaje entrante de un portal o de la web. Se asigna a un cliente existente o crea uno                   |
| Búsqueda guardada                     | `SavedSearch`               | Búsqueda               | Criterios de lo que busca un cliente; se cruzan con el stock para avisos                                 |
| Propiedad destacada (para un cliente) | `FeaturedListing`           | Propiedad destacada    | Propiedad que un agente le marcó a un cliente puntual para ofrecérsela. **No** es la destacada de la web |
| Envío de ficha                        | `SharedListing` (a definir) | Envío                  | Ficha mandada por email o WhatsApp con un link que mide aperturas y "me gusta"                           |
| Seguimiento automático                | —                           | Seguimiento automático | Envío automático de novedades que coinciden con búsquedas guardadas o destacadas                         |
| Respuesta rápida                      | —                           | Respuesta rápida       | Plantilla de email con variables                                                                         |
| Reserva                               | `Reservation` (a definir)   | Reserva                | Seña sobre una propiedad. Activa, caída o firmada. Una sola activa por propiedad                         |

## Cartera

| Término                 | En el código                   | En Tokko                | Significado                                                                                                     |
| ----------------------- | ------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| Propiedad               | `Property`                     | Propiedad               | Inmueble de la cartera de Norde                                                                                 |
| Operación               | `Operation`                    | Operación               | Venta, alquiler o alquiler temporario. Una propiedad puede ofrecerse en más de una                              |
| Estado de propiedad     | `PropertyStatus`               | Estado                  | Borrador, disponible, reservada, vendida, alquilada, pausada, dada de baja                                      |
| Destacada en web        | `featured`                     | Destacado en web        | Propiedad que aparece en "Destacados" del sitio. **No** es la propiedad destacada para un cliente               |
| Publicar en web         | `publishedOnWeb`               | Publicar                | Si la propiedad se muestra en el sitio                                                                          |
| Código de referencia    | `code`                         | Código de referencia    | Identificador legible de la propiedad: prefijo + 4 dígitos (`CAS0012`). Único; se puede cargar a mano           |
| Marca de agua           | `Watermark`                    | Marca de agua           | Logo sobre las fotos que van a portales y PDF. La foto original no se modifica                                  |
| Dirección para publicar | —                              | Dirección para publicar | La que se muestra afuera; la real es privada salvo que se habilite                                              |
| Ambientes               | `rooms`                        | Ambientes               | Cantidad de espacios habitables sin contar cocina ni baños (uso argentino: un "2 ambientes" tiene 1 dormitorio) |
| Expensas                | `expenses`                     | Expensas                | Gasto mensual de mantenimiento del edificio                                                                     |
| Apto crédito            | —                              | Apto crédito            | Se puede comprar con crédito hipotecario                                                                        |
| Permuta                 | —                              | Permuta                 | El dueño acepta otra propiedad como parte de pago                                                               |
| Escritura inmediata     | —                              | Escritura inmediata     | Se puede escriturar sin esperas (sin trámites pendientes)                                                       |
| Emprendimiento          | `Development` (a definir)      | Emprendimiento          | Desarrollo en pozo o en construcción que agrupa unidades                                                        |
| Unidad                  | `Property` con `developmentId` | Unidad                  | Propiedad que pertenece a un emprendimiento                                                                     |
| Desarrollista           | —                              | Desarrollista           | Empresa que construye el emprendimiento                                                                         |
| Tasación                | `Appraisal`                    | Tasación                | Estimación del valor de una propiedad. "Ingresada" en Tokko = convertida en captación                           |
| Captación               | —                              | —                       | Propiedad que entra a la cartera (por ejemplo, desde una tasación)                                              |

## Difusión

| Término                  | En el código | En Tokko         | Significado                                                          |
| ------------------------ | ------------ | ---------------- | -------------------------------------------------------------------- |
| Portal                   | `portal`     | Portal           | Sitio de avisos: MercadoLibre, Zonaprop, Argenprop y otros           |
| Publicación / aviso      | `listing`    | Publicación      | Una propiedad publicada en un portal, con su estado y errores        |
| Aviso simple / destacado | —            | Simple / Premium | Nivel de exposición pagado en el portal                              |
| Vidriera                 | —            | Carrusel         | Monitor en la vidriera de la oficina que rota propiedades destacadas |

## Alquileres

| Término   | En el código                 | En Tokko          | Significado                                                                   |
| --------- | ---------------------------- | ----------------- | ----------------------------------------------------------------------------- |
| Contrato  | `RentalContract` (a definir) | Asiprop (externo) | Contrato de alquiler con partes, montos y vigencia                            |
| IPC / ICL | —                            | —                 | Índices oficiales para actualizar alquileres                                  |
| Garante   | —                            | —                 | Quien garantiza el contrato: propietaria, seguro de caución, recibo de sueldo |
