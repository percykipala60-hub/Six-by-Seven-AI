import { redirect } from 'next/navigation';
import { LIEN_MENTIONS } from '@/lib/liens';

// Une seule version des pages juridiques, sur le site : l'ancienne adresse de l'application y renvoie (mentions légales).
export default function Page() {
  redirect(LIEN_MENTIONS);
}
