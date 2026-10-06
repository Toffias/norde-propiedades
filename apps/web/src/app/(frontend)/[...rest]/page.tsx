import { notFound } from 'next/navigation';

// La app tiene dos layouts raíz (sitio y Payload): una URL que no coincide con ninguna ruta
// mostraría el 404 genérico de Next. Este catch-all la manda al `not-found` del sitio.
export default function UnknownPage(): never {
  notFound();
}
