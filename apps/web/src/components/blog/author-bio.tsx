import type { Author } from '../../lib/blog/queries';
import { MediaImage } from './media-image';

/** Autores al pie del post: nombre, cargo, bio y foto (señal E-E-A-T). */
export function AuthorBio({ authors }: { readonly authors: readonly Author[] }) {
  if (authors.length === 0) return null;

  return (
    <aside aria-label="Sobre los autores" className="mt-12 space-y-4">
      {authors.map((author) => (
        <div key={author.id} className="bg-muted/40 flex gap-4 rounded-xl border p-5">
          <div className="bg-muted text-muted-foreground flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full text-lg font-semibold">
            {author.photo ? (
              <MediaImage media={author.photo} sizes="56px" className="size-full" />
            ) : (
              <span aria-hidden>{author.name.charAt(0)}</span>
            )}
          </div>
          <div className="space-y-1">
            <p className="font-semibold">
              {author.name}
              {author.role && (
                <span className="text-muted-foreground font-normal"> · {author.role}</span>
              )}
            </p>
            {author.bio && <p className="text-muted-foreground text-sm">{author.bio}</p>}
          </div>
        </div>
      ))}
    </aside>
  );
}
