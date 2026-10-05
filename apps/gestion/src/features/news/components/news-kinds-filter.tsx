'use client';

import { NEWS_KIND_VALUES, type NewsKindValue } from '@norde/core/audit/contracts';
import { Button } from '@norde/ui/components/button';
import { Checkbox } from '@norde/ui/components/checkbox';
import { Label } from '@norde/ui/components/label';
import { Popover, PopoverContent, PopoverTrigger } from '@norde/ui/components/popover';
import { ChevronDownIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';

import { NEWS_KIND_GROUPS, NEWS_KINDS_COOKIE, serializeNewsKinds } from '../news-kinds';

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

function storeKinds(kinds: readonly NewsKindValue[]): void {
  document.cookie = `${NEWS_KINDS_COOKIE}=${serializeNewsKinds(kinds)}; path=/; max-age=${String(ONE_YEAR_IN_SECONDS)}; samesite=lax`;
}

/** "Mostrando 8 tipos de noticias": los tipos que se ven, guardados en una cookie. */
export function NewsKindsFilter({ selected }: { readonly selected: readonly NewsKindValue[] }) {
  const router = useRouter();
  const id = useId();
  const [kinds, setKinds] = useState<readonly NewsKindValue[]>(selected);
  const [pending, startTransition] = useTransition();
  const all = kinds.length === NEWS_KIND_VALUES.length;

  function apply(next: readonly NewsKindValue[]) {
    const ordered = NEWS_KIND_VALUES.filter((kind) => next.includes(kind));
    setKinds(ordered);
    storeKinds(ordered);
    startTransition(() => {
      router.refresh();
    });
  }

  const summary =
    kinds.length === 1
      ? 'Mostrando 1 tipo de noticia'
      : `Mostrando ${String(kinds.length)} tipos de noticias`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-busy={pending}>
          {all ? 'Mostrando todas las noticias' : summary}
          <ChevronDownIcon className="size-4" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <p className="mb-3 text-sm font-semibold text-foreground">Elegí qué noticias querés ver</p>
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${id}-all`}
            checked={all}
            onCheckedChange={(checked) => {
              apply(checked === true ? [...NEWS_KIND_VALUES] : []);
            }}
          />
          <Label htmlFor={`${id}-all`}>Todas las noticias</Label>
        </div>
        {NEWS_KIND_GROUPS.map((group) => (
          <fieldset key={group.label} className="mt-4 flex flex-col gap-2">
            <legend className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {group.label}
            </legend>
            {group.kinds.map((option) => (
              <div key={option.kind} className="flex items-center gap-2">
                <Checkbox
                  id={`${id}-${option.kind}`}
                  checked={kinds.includes(option.kind)}
                  onCheckedChange={(checked) => {
                    apply(
                      checked === true
                        ? [...kinds, option.kind]
                        : kinds.filter((kind) => kind !== option.kind),
                    );
                  }}
                />
                <Label htmlFor={`${id}-${option.kind}`} className="font-normal">
                  {option.label}
                </Label>
              </div>
            ))}
          </fieldset>
        ))}
      </PopoverContent>
    </Popover>
  );
}
