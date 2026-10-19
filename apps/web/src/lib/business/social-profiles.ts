// Las redes sociales de Norde salen de `BUSINESS.sameAs`: para sumar una, alcanza con agregar su
// URL ahí (también va al JSON-LD). Los perfiles que no son redes conocidas (portales) no se listan.

export type SocialNetwork = 'facebook' | 'instagram' | 'linkedin' | 'youtube';

export interface SocialProfile {
  readonly network: SocialNetwork;
  readonly label: string;
  readonly url: string;
}

const NETWORKS: readonly { network: SocialNetwork; label: string; hosts: readonly string[] }[] = [
  { network: 'facebook', label: 'Facebook', hosts: ['facebook.com', 'fb.com'] },
  { network: 'instagram', label: 'Instagram', hosts: ['instagram.com'] },
  { network: 'linkedin', label: 'LinkedIn', hosts: ['linkedin.com'] },
  { network: 'youtube', label: 'YouTube', hosts: ['youtube.com', 'youtu.be'] },
];

/** Una URL mal cargada no rompe el header: simplemente no se muestra. */
function hostOf(url: string): string | undefined {
  if (!URL.canParse(url)) return undefined;
  return new URL(url).hostname.replace(/^(www|m)\./, '');
}

/** Las redes de la lista, en el orden en que se cargaron. */
export function socialProfiles(urls: readonly string[]): readonly SocialProfile[] {
  return urls.flatMap((url) => {
    const host = hostOf(url);
    const known = NETWORKS.find((n) => host !== undefined && n.hosts.includes(host));
    return known ? [{ network: known.network, label: known.label, url }] : [];
  });
}
