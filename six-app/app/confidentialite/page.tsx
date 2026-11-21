import Link from "next/link";
import { AppBar } from "@/components/AppBar";

export const metadata = { title: "Confidentialité — Six" };

const ETAPES = [
  ["Masquage sur ton téléphone", "Avant tout envoi, Six remplace par des repères ce qu'il reconnaît : noms, numéros, codes, comptes, adresses, e-mails, liens et pseudos. La détection est automatique et peut en oublier : tu relis le texte masqué et tu peux masquer un nom de plus avant de continuer. Les captures d’écran sont lues sur ton téléphone et ne sont jamais envoyées."],
  ["Analyse sur notre serveur", "Le texte masqué est analysé. Rien n'est enregistré ni journalisé."],
  ["Rédaction par un partenaire cloud", "Seul le texte masqué est envoyé au modèle qui rédige les réponses."],
  ["Effacement immédiat", "À la copie de la réponse, la conversation disparaît de la mémoire de l'app. Il n'y a pas d'historique."],
  ["Mémoire de Six, sur ton téléphone", "Si elle est activée, Six garde sur ton téléphone des nombres sur les réponses que tu choisis (longueur, tu ou vous, emojis), ce que tu écris toi-même sur un contact et tes suivis. Jamais le texte de tes conversations. Ces souvenirs partent masqués avec une demande de réponses. Tu les vois, les désactives et les effaces dans Réglages ; tout est oublié après 90 jours."],
];

export default function Page() {
  return (
    <div className="app">
      <AppBar page="reglages" titre="Confidentialité" />
      <main className="screen">
        <h1>
          Ce qui se passe <em>avec tes messages</em>
        </h1>
        <div className="stack">
          {ETAPES.map(([titre, texte], i) => (
            <div className="card" key={titre}>
              <b>
                {i + 1}. {titre}
              </b>
              <p className="muted small">{texte}</p>
            </div>
          ))}
        </div>
        <div className="card">
          <Link href="/conditions" className="row sp" style={{ textDecoration: "none", color: "inherit", minHeight: 44 }}>
            <span>Conditions d&apos;utilisation</span>
            <span aria-hidden="true">›</span>
          </Link>
          <Link href="/mentions" className="row sp" style={{ textDecoration: "none", color: "inherit", minHeight: 44 }}>
            <span>Mentions légales</span>
            <span aria-hidden="true">›</span>
          </Link>
        </div>
      </main>
    </div>
  );
}
