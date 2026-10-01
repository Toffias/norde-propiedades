import type { Metadata } from 'next';

import { ContactsListDemo } from '../../_components/contacts-list-demo';

export const metadata: Metadata = { title: 'Listado' };

export default function ListPatternPage() {
  return <ContactsListDemo />;
}
