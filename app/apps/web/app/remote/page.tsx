import { redirect } from 'next/navigation';

/** Les discussions Remote sont maintenant dans les Récents du Chat (logo Remote) : l'ancienne page y renvoie. */
export default function Page() {
  redirect('/chat');
}
