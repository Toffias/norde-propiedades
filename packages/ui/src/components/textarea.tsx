import type { ComponentProps } from 'react';

import { cn } from '../lib/utils';
import { fieldClassName } from './input';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldClassName, 'field-sizing-content flex min-h-16 py-2', className)}
      {...props}
    />
  );
}
