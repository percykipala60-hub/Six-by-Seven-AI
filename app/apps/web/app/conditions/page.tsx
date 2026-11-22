import { redirect } from 'next/navigation';
import { LIEN_CONDITIONS } from '@/lib/liens';

// Une seule version des pages juridiques, sur le site : l'ancienne adresse de l'application y renvoie (conditions d’utilisation).
export default function Page() {
  redirect(LIEN_CONDITIONS);
}
