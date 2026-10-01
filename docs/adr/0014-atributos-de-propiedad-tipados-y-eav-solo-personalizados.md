# ADR 0014: Los atributos estándar de una propiedad son columnas tipadas; EAV solo para los personalizados

- **Estado**: aceptada
- **Fecha**: 2026-10-01

## Contexto

La ficha de propiedad de Tokko tiene decenas de atributos: superficies, ambientes, antigüedad, orientación, apto crédito, etc. (#5). El modelo de Tokko los guarda casi todos como pares atributo-valor (EAV). Además, la inmobiliaria puede definir atributos propios.

EAV es flexible, pero cada filtro de la grilla y del buscador se vuelve un `join` por atributo, sin tipos ni índices útiles. La regla "Listados: siempre paginados en el servidor" exige un índice por cada filtro y orden.

## Decisión

- **Todo atributo estándar es una columna tipada** de `properties` (o de `developments`): `integer`, `boolean`, `numeric(10,2)` para superficies, `text` validado con Zod para los enumerados. Lo que se filtra u ordena tiene índice.
- Los servicios, ambientes y amenities son un catálogo (`features`) con una tabla de vínculo (`property_features`), porque son una lista de sí/no que crece.
- **EAV solo para los atributos personalizados** que define Norde:
  - `property_custom_attributes`: definición (`name`, `kind`: `text` / `number` / `boolean` / `select`, `options`, `position`, `is_active`).
  - `property_custom_attribute_values`: un valor por propiedad y atributo, en la columna de su tipo (`value_text`, `value_number`, `value_boolean`).
- La validación del valor contra la definición es una regla de dominio, no de la base.

## Consecuencias

- Los filtros estándar son SQL simple con índices; el tipo lo garantiza la base.
- Sumar un atributo estándar es una migración (columna nullable). Sumar uno personalizado no requiere código.
- Los atributos personalizados se pueden filtrar por `(attribute_id, value_text)`, pero sin la performance de una columna. Si uno se vuelve importante, se promueve a columna con un backfill.
