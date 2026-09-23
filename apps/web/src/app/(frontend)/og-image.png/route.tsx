import { ImageResponse } from 'next/og';

import { BUSINESS } from '../../../constants/business';

// Imagen Open Graph por defecto (1200x630), generada en el build. Se reemplaza por una
// pieza de la marca cuando esté la identidad de Norde (DESIGN.md).
export const dynamic = 'force-static';

export function GET(): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 80px',
        background: '#0a0a0a',
        color: '#fafafa',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', fontSize: 40, fontWeight: 600, letterSpacing: -1 }}>
        Norde<span style={{ color: '#a3a3a3', fontWeight: 400 }}>&nbsp;Propiedades</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
          {BUSINESS.tagline}
        </div>
        <div style={{ fontSize: 30, color: '#a3a3a3' }}>
          Tasaciones y administración de alquileres
        </div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
