# CLAUDE.md: @norde/core

Dominio y casos de uso de Norde. **Es el corazón del sistema y no conoce a nadie**: ni frameworks, ni base de datos, ni APIs.

Se aplica además del `CLAUDE.md` de la raíz.

## Dependencias permitidas

- `domain/`: **ninguna** dependencia externa. Excepciones aprobadas (librerías puras): `decimal.js` (cálculos de índices) y `libphonenumber-js` (value object `Phone`).
- El `tsconfig` del core no incluye tipos de Node (`types: []`): `process`, `Buffer`, `setTimeout`, etc. no existen acá, y eso es intencional.
- Todo esto lo verifica `eslint-plugin-boundaries` (`packages/config/eslint/index.js`). Si una regla nueva lo requiere, se cambia ahí **y** en este archivo.
- `application/` y `contracts/`: `zod` y lo mismo que `domain/`.
- PROHIBIDO agregar a `package.json` cualquier otra dependencia de runtime sin un ADR.

## Estructura de un módulo

```
<module>/
├── domain/
│   ├── <aggregate>.ts            # Aggregate root: estado privado, métodos con intención de negocio
│   ├── <value-object>.ts         # create(raw): Result<VO, E>; inmutable
│   ├── <aggregate>.events.ts     # Eventos de dominio (en pasado: PropertyPublished)
│   ├── <aggregate>.errors.ts     # Uniones discriminadas de errores
│   └── <aggregate>.repository.ts # Puerto (interface): save, findById…
├── application/
│   ├── commands/<verb-noun>.ts   # Un caso de uso por archivo
│   ├── queries/<get|search-…>.ts
│   ├── handlers/on-<event>.ts    # Reacciones a eventos de otros módulos
│   └── ports/                    # Interfaces de servicios externos (Geocoder, Mailer…)
├── contracts/                    # Schemas Zod de inputs y outputs + tipos inferidos. Sin lógica
└── index.ts                      # API pública: casos de uso, contracts, tipos, eventos
```

## Reglas

- **Aggregates**:
  - Constructor privado.
  - Se crean con `create()` (valida y emite evento) o `restore()` (rehidratación desde el repo, sin eventos).
  - Sin setters públicos: métodos como `publish()`, `changePrice()`, `markAsReserved()`.
- **Invariantes** dentro del aggregate. Si un estado es inválido, no se puede construir.
- **Estados con transiciones** (propiedad, oportunidad, contrato, tasación): modelados como máquina de estados explícita en el dominio. Las transiciones inválidas devuelven un error tipado.
- Los repositorios trabajan con **aggregates completos**, no con filas ni DTOs.
- Los **casos de uso**:
  1. Validan permisos con `actor.can(...)` como primera acción.
  2. Corren dentro de `uow.run(...)` si escriben.
  3. Publican los eventos del aggregate (`pullEvents()`) en el outbox.
  4. Auditan con `audit.record(...)`.
  5. Devuelven DTOs, **nunca** aggregates, hacia afuera del core.
- Los **handlers de eventos** son idempotentes.
- `contracts/` es importable desde componentes cliente de React: **nada** de lógica ni imports de `domain/` o `application/` ahí.
- El tiempo sale de `Clock` y los IDs de `IdGenerator`. PROHIBIDO `new Date()`, `Date.now()` y `crypto.randomUUID()` en este paquete.

## Tests

- `domain/`: unit tests puros, sin fakes. Objetivo: 90% de cobertura.
- `application/`: fakes en memoria en `src/<module>/testing/` (por ejemplo, `InMemoryPropertyRepository`), reutilizables. Objetivo: 80%.
- Cada caso de uso: camino feliz, cada error esperado y actor sin permiso.
