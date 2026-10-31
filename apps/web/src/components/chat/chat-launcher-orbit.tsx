const FILTER_ID = 'chat-launcher-goo';

/**
 * Las partículas que giran alrededor de la burbuja cerrada. Van debajo de ella y fuera de su
 * contenedor (que recorta). La grande comparte un filtro "gooey" con un disco igual a la burbuja:
 * al acercarse, se funde con el círculo. Las chicas asoman desde atrás y vuelven a esconderse.
 * Decorativo: sin movimiento reducido, no se muestra.
 */
export function ChatLauncherOrbit({ className }: { readonly className: string }) {
  return (
    <div aria-hidden className={`pointer-events-none size-14 motion-reduce:hidden ${className}`}>
      <svg className="absolute size-0">
        <filter id={FILTER_ID}>
          <feGaussianBlur in="SourceGraphic" stdDeviation="4.5" result="blur" />
          <feColorMatrix
            in="blur"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </svg>
      <div className="absolute -inset-8" style={{ filter: `url(#${FILTER_ID})` }}>
        <span className="bg-primary absolute inset-8 rounded-full" />
        <span className="chat-orbit absolute inset-0">
          <span className="chat-orbit-main bg-primary absolute top-1/2 left-1/2 -m-1.5 size-3 rounded-full" />
        </span>
      </div>
      <span
        className="chat-orbit absolute inset-0"
        style={{ animationDuration: '5s', animationDirection: 'reverse' }}
      >
        <span className="chat-orbit-peek bg-primary absolute top-1/2 left-1/2 -m-[3px] size-1.5 rounded-full" />
      </span>
      <span className="chat-orbit absolute inset-0" style={{ animationDuration: '9.5s' }}>
        <span
          className="chat-orbit-peek bg-primary absolute top-1/2 left-1/2 -m-0.5 size-1 rounded-full"
          style={{ animationDuration: '19s', animationDelay: '-7s' }}
        />
      </span>
    </div>
  );
}
