import type { Metadata } from 'next';
import { StepHeaderLink } from '../arnaques/StepHeaderLink';

export const metadata: Metadata = { title: 'Confidentialité' };

const ETAPES = [
  {
    titre: 'Masquage sur ton téléphone',
    texte:
      'Avant tout envoi, Six remplace les noms, numéros et e-mails par [NOM 1], [TEL 1]… Tu vois ce qui part et tu corriges. Six peut en oublier : relis toujours.',
  },
  {
    titre: 'Analyse sur notre serveur',
    texte:
      'Le serveur reçoit seulement le texte masqué (les derniers messages, 2000 caractères au plus). Il refait un masquage des numéros et e-mails. Il n’enregistre rien : ses journaux ne contiennent aucun mot de tes messages.',
  },
  {
    titre: 'Rédaction par un partenaire cloud',
    texte:
      'Pour rédiger, le serveur envoie ce texte masqué à un modèle d’IA (Claude, d’Anthropic). En moteur « Confidentiel », rien ne part chez un partenaire : tout reste sur le serveur de Seven.AI.',
  },
  {
    titre: 'Effacement immédiat',
    texte:
      'Aucun historique de conversation, ni sur nos serveurs ni dans l’app. Les vrais noms sont remis dans les brouillons sur ton téléphone seulement. Quand tu copies une réponse, la conversation est effacée de la page.',
  },
] as const;

export default function ConfidentialitePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col pb-10">
      <StepHeaderLink />
      <h1 className="px-5 pt-2 pb-4 font-display text-[26px] leading-tight font-bold">
        Ce qui se passe <span className="text-accent">avec tes messages</span>
      </h1>
      <ol className="flex flex-col gap-3 px-5">
        {ETAPES.map((e, i) => (
          <li
            key={e.titre}
            className="flex gap-3 rounded-[20px] bg-surface px-4 py-3.5 ring-1 ring-line"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-[14px] font-semibold text-on-accent">
              {i + 1}
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-[15px] font-semibold">{e.titre}</span>
              <span className="text-[14px] leading-relaxed text-muted">{e.texte}</span>
            </span>
          </li>
        ))}
      </ol>

      <section
        className="flex flex-col gap-2 px-5 pt-6 text-[14px] leading-relaxed text-muted"
        aria-labelledby="politique"
      >
        <h2 id="politique" className="font-display text-[18px] font-semibold text-text">
          Politique de confidentialité
        </h2>
        <p>
          <strong className="text-text">Ce que Six garde sur ton téléphone :</strong> tes réglages
          (thème, ton, moteur…) et le nombre de fois où tu choisis chaque type de réponse (« Directe
          » : 4). Aucun texte. Tu peux tout effacer dans Réglages.
        </p>
        <p>
          <strong className="text-text">Ce que nos serveurs gardent :</strong> rien de tes
          conversations. Les journaux techniques contiennent seulement des compteurs (durée, niveau
          d’arnaque détecté, nombre de corrections). Le bouton « Cette réponse t’a aidé ? » envoie
          oui ou non, jamais de texte.
        </p>
        <p>
          <strong className="text-text">Import WhatsApp :</strong> Six ne lit jamais tes discussions
          tout seul. C’est toi qui exportes et choisis le fichier, ou qui colles le texte.
        </p>
        <p>
          <strong className="text-text">Tes droits :</strong> comme rien n’est conservé, il n’y a
          rien à te restituer ni à supprimer de notre côté. Pour toute question, contacte l’équipe
          Seven.AI.
        </p>
      </section>

      <section
        className="flex flex-col gap-2 px-5 pt-6 text-[14px] leading-relaxed text-muted"
        aria-labelledby="conditions"
      >
        <h2 id="conditions" className="font-display text-[18px] font-semibold text-text">
          Conditions d’utilisation
        </h2>
        <p>
          Six propose, tu décides : les brouillons sont des suggestions, c’est toi qui choisis,
          modifies et envoies. Relis toujours avant d’envoyer. L’alerte anti-arnaque aide à repérer
          les pièges connus mais ne garantit rien : en cas de doute, ne donne ni code, ni argent.
        </p>
      </section>

      <section
        className="flex flex-col gap-2 px-5 pt-6 text-[14px] leading-relaxed text-muted"
        aria-labelledby="mentions"
      >
        <h2 id="mentions" className="font-display text-[18px] font-semibold text-text">
          Mentions légales
        </h2>
        <p>
          Six est édité par Seven.AI (7 AI), projet étudiant PBL5 « Tools for team building »,
          Université Loyola du Congo (ULC-ICAM), Kinshasa. Version de développement.
        </p>
      </section>
    </main>
  );
}
