import { redirect } from 'next/navigation';
import { LIEN_CONFIDENTIALITE } from '@/lib/liens';

// Une seule version des pages juridiques, sur le site : l'ancienne adresse de l'application y renvoie (politique de confidentialité).
export default function Page() {
  redirect(LIEN_CONFIDENTIALITE);
}
