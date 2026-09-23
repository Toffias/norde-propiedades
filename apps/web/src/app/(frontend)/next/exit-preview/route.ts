import { draftMode } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';

import { isSafeRelativePath } from '../../../../lib/seo/safe-path';
import { routes } from '../../../../lib/seo/routes';

/** Sale del draft mode y vuelve a la página (o a la home). */
export async function GET(request: NextRequest): Promise<Response> {
  (await draftMode()).disable();
  const path = request.nextUrl.searchParams.get('path');
  redirect(path && isSafeRelativePath(path) ? path : routes.home());
}
