import { ChevronDown } from 'lucide-react';

import { faqSchema, type FaqEntry } from '../../lib/seo/json-ld';
import { JsonLdScript } from '../seo/json-ld-script';

/** Preguntas frecuentes con `<details>` (sin JavaScript) + `FAQPage`. */
export function FaqSection({ entries }: { readonly entries: readonly FaqEntry[] }) {
  const schema = faqSchema(entries);
  if (!schema) return null;

  return (
    <section aria-labelledby="faq-title" className="mt-12">
      <JsonLdScript data={schema} />
      <h2 id="faq-title" className="mb-4 text-2xl font-semibold tracking-tight">
        Preguntas frecuentes
      </h2>
      <div className="divide-y rounded-xl border">
        {entries.map((entry) => (
          <details key={entry.question} className="group px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
              <h3>{entry.question}</h3>
              <ChevronDown
                aria-hidden
                className="text-muted-foreground size-5 shrink-0 transition-transform group-open:rotate-180"
              />
            </summary>
            <p className="text-muted-foreground mt-3 whitespace-pre-line">{entry.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
