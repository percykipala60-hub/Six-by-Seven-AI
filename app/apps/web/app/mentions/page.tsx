import { redirect } from 'next/navigation';

// Les mentions légales font désormais partie du document « Conditions et mentions légales ».
export default function Page() {
  redirect('/conditions');
}
