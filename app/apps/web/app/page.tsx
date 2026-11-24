import { redirect } from 'next/navigation';

/**
 * Entrée de l'app : le Chat est le premier écran (après connexion, ou en revenant dans l'app).
 * Une adresse avec des paramètres (?action=…, ?g=…, anciens liens de Responsive) va dans Responsive, qui les lit.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p))
    for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) qs.append(k, x);
  redirect(qs.size ? `/responsive?${qs.toString()}` : '/chat');
}
