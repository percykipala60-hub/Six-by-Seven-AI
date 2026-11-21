import type { Metadata } from 'next';
import Link from 'next/link';
import { StepHeaderLink } from './StepHeaderLink';

export const metadata: Metadata = { title: 'Arnaques de chez nous' };

/**
 * Les arnaques les plus courantes à Kinshasa, avec ce que Six repère dans chacune.
 * À enrichir avec de vrais exemples collectés par l'équipe (noms et numéros masqués).
 */
const ARNAQUES = [
  {
    titre: 'Faux agent mobile money',
    exemple:
      '« Votre compte M-Pesa sera bloqué dans 1 heure. Envoyez votre code PIN pour le réactiver. »',
    signes: ['Code PIN demandé', 'Menace de blocage', 'Urgence', 'Numéro inconnu'],
  },
  {
    titre: 'Faux transfert reçu',
    exemple: '« Je me suis trompé, je vous ai envoyé 50 000 FC. Renvoyez-les svp. »',
    signes: ['Argent à renvoyer', 'Aucun SMS officiel de ton opérateur'],
  },
  {
    titre: 'Faux proche, nouveau numéro',
    exemple: '« C’est moi, j’ai changé de numéro. Envoie-moi 20 $ vite, n’en parle à personne. »',
    signes: ['Nouveau numéro', 'Argent demandé', 'Secret', 'Urgence'],
  },
  {
    titre: 'Faux gain ou tombola',
    exemple: '« Félicitations ! Vous avez gagné 500 000 FC. Payez d’abord 10 000 FC de frais. »',
    signes: ['Gain inattendu', 'Frais à payer avant'],
  },
  {
    titre: 'Faux recruteur, bourse fictive',
    exemple: '« Poste disponible / bourse à l’étranger. Frais de dossier : 30 $. »',
    signes: ['Offre trop belle', 'Frais de dossier'],
  },
  {
    titre: 'Lien raccourci',
    exemple: '« Confirmez votre compte ici : bit.ly/… »',
    signes: ['Lien qui cache sa vraie adresse'],
  },
] as const;

export default function ArnaquesPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col">
      <StepHeaderLink />
      <div className="flex flex-col gap-1.5 px-5 pt-2 pb-4">
        <h1 className="font-display text-[26px] leading-tight font-bold">
          Arnaques <span className="text-accent">de chez nous</span>
        </h1>
        <p className="text-[14px] text-muted">
          Six les repère sur ton téléphone, sans réseau. Voici les plus courantes.
        </p>
      </div>
      <div className="flex flex-col gap-3 px-5">
        <section className="rounded-[20px] border-2 border-alert bg-alert/10 px-4 py-3.5">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-alert uppercase">
            Règle d’or
          </p>
          <p className="mt-1 font-display text-[18px] font-semibold">
            Personne ne te demandera ton code PIN. Jamais.
          </p>
          <p className="mt-1 text-[14px] text-muted">
            Ni ton opérateur, ni ta banque, ni un proche. Un doute ? Appelle la personne sur son
            ancien numéro, ou ton opérateur au numéro officiel.
          </p>
        </section>
        {ARNAQUES.map((a) => (
          <section key={a.titre} className="rounded-[20px] bg-surface px-4 py-3.5 ring-1 ring-line">
            <h2 className="text-[15px] font-semibold">{a.titre}</h2>
            <p className="mt-1 text-[14px] text-muted italic">{a.exemple}</p>
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Ce que Six repère">
              {a.signes.map((s) => (
                <li
                  key={s}
                  className="rounded-full bg-alert/15 px-3 py-1 text-[12px] text-alert-soft"
                >
                  {s}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="sticky bottom-0 mt-auto bg-gradient-to-t from-ground from-70% to-transparent px-5 pt-6 pb-4">
        <Link
          href="/repondre"
          className="flex min-h-12 items-center justify-center rounded-2xl bg-accent px-5 font-display text-base font-semibold text-on-accent"
        >
          Vérifier un message suspect
        </Link>
      </div>
    </main>
  );
}
