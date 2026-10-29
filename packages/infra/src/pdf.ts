// Los PDF armados con react-pdf (ADR 0051): una entrada aparte para que las apps que no arman PDF
// (apps/agent) no compilen JSX ni carguen react-pdf.

export { ReactPdfPropertySheetRenderer } from './adapters/exports/pdf/property-sheet-renderer';
export { ReactPdfShowcaseRenderer } from './adapters/exports/pdf/showcase-renderer';
export { ReactPdfOwnerReportRenderer } from './adapters/exports/pdf/owner-report-renderer';
