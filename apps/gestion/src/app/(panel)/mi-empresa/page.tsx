import { redirect } from 'next/navigation';

// La primera sección de Mi empresa.
export default function CompanyPage() {
  redirect('/mi-empresa/usuarios');
}
