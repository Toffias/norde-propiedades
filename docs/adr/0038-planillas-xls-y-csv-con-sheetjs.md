# ADR 0038: Planillas `.xls` y `.csv` para importar (SheetJS)

- **Estado**: aceptada
- **Fecha**: 2026-10-20
- **Complementa**: la importación de contactos (#8, `docs/modulos/03-sistema-gestion.md` §3.3.4) y la migración desde Tokko (#17).

## Contexto

La importación de contactos leía solo `.xlsx`, con `exceljs`. Tokko Broker exporta en otros formatos:

- Los contactos, en `.xls` (Excel 97-2003, un documento compuesto de OLE con el libro en BIFF8).
- Las propiedades, en `.csv` UTF-8 separado por comas.

`exceljs` no lee `.xls`. Pedirle a Norde que abra cada exportación en Excel y la guarde como `.xlsx` es un paso manual que se repite en cada corrida de la migración. Con 4.600 contactos, guardar la planilla en Excel además cambia los teléfonos largos a notación científica.

## Decisión

- **El servidor reconoce el formato por el contenido**, no por el nombre del archivo (`UploadedSpreadsheetReader` en `@norde/infra`):
  - `PK\x03\x04` (ZIP): `.xlsx`, con `exceljs`, como hasta ahora.
  - `D0 CF 11 E0` (OLE): `.xls`, con **SheetJS**.
  - Cualquier otro texto: `.csv`, con un parser propio (RFC 4180, coma, punto y coma o tabulación, UTF-8 o Windows-1252). Un archivo con bytes nulos es binario y no se lee.
- **SheetJS desde su CDN** (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, fijado en el `catalog`). La versión de npm (`xlsx@0.18.5`) está abandonada y tiene CVEs (contaminación de prototipos y ReDoS) que se corrigieron recién en las versiones del CDN.
- **SheetJS solo lee `.xls`.** El `.xlsx` sigue con `exceljs`, que ya escribe las exportaciones; el `.csv` no pasa por SheetJS, porque SheetJS adivina números y fechas y convertiría "11-07-2017" o un teléfono en otra cosa.
- **Los valores llegan como texto**, igual que con `.xlsx`: un entero sin notación científica y una celda con formato de fecha como `AAAA-MM-DD`, sin zona horaria.
- **El archivo se procesa siempre en el servidor** (caso de uso y job). El navegador solo lo sube.
- La importación de unidades de un emprendimiento sigue aceptando solo `.xlsx`. El lector nuevo sirve para cualquier importación que lo necesite.

## Consecuencias

- Las exportaciones de Tokko se importan tal como salen.
- Una dependencia más, fuera de npm: `pnpm outdated` no avisa versiones nuevas, y la actualización es manual (cambiar la URL del `catalog`).
- Un `.xls` o `.csv` dañado o que no es una planilla se rechaza como `UnreadableSpreadsheet`, igual que un `.xlsx` dañado.
