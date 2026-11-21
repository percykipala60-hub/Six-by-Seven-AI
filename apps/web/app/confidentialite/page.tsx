import Link from 'next/link';
import { AppBar } from '@/components/AppBar';

export const metadata = { title: 'Confidentialité — Six' };

const sections = [
  {
    title: 'En bref',
    text: [
      'Six, édité par Seven.AI (projet PBL5, Groupe 7, ULC-Icam, Kinshasa), aide à comprendre une conversation et à rédiger une réponse. Tu gardes le contrôle : aucun message ne part sans ton action.',
      'Nous ne vendons pas tes données et Six n’utilise pas de publicité ciblée. Cette page explique quelles données sont traitées, pourquoi, où elles passent et comment les effacer.',
    ],
  },
  {
    title: 'Messages et captures',
    text: [
      'Tu choisis le texte ou l’image à analyser. La lecture des captures (OCR) se fait sur ton appareil. Six tente de remplacer localement les noms, numéros et autres éléments reconnus par des repères. Ce masquage automatique peut manquer un élément : vérifie le texte affiché avant de continuer.',
      'Lors d’une analyse ou d’une demande de réponse, le texte transmis passe par notre serveur puis par un fournisseur d’IA (Anthropic/Claude ou OpenAI selon la disponibilité). Le fournisseur reçoit le texte préparé par Six, qui peut encore contenir des renseignements personnels si le masquage les a manqués. Les fournisseurs appliquent leurs propres règles de traitement et de conservation à leurs API. Consulte leurs politiques pour les détails.',
      'Six ne conserve pas un historique de tes conversations analysées dans ton compte. Notre code serveur ne journalise pas le contenu des messages; l’hébergeur peut toutefois traiter des journaux techniques nécessaires au fonctionnement et à la sécurité.',
    ],
  },
  {
    title: 'Données conservées sur ton appareil',
    text: [
      'La mémoire facultative de Six (préférences résumées, notes de contact et suivis que tu ajoutes) reste dans le stockage de l’application si tu n’es pas connecté. Elle peut être conservée jusqu’à 90 jours et se gère dans Réglages > Mémoire.',
      'Sur Android, si tu actives l’accès système et choisis des applications, Six reçoit les aperçus de notification que ces apps publient et garde au maximum les 25 plus récents dans le stockage privé de l’appareil. Les réglages Android ou de l’app source peuvent masquer leur contenu. Rien n’est envoyé à l’IA à la réception ni à l’importation : il faut ensuite lancer l’analyse dans Six. Tu peux effacer ces aperçus dans Réglages ou retirer l’autorisation Android.',
      'Sur iPhone, iOS ne permet pas à Six de lire les notifications des autres apps. Tu peux choisir « Partager » puis « Six » dans une app compatible pour préparer du texte ou un lien localement. Six ne lance aucune analyse avant que tu la demandes.',
    ],
  },
  {
    title: 'Compte et synchronisation',
    text: [
      'Si tu crées un compte, Six traite ton adresse e-mail ou ton numéro pour l’authentification, ainsi que ton prénom et la mémoire que tu choisis de synchroniser. Ces données sont hébergées par Supabase dans la région configurée à Paris (Union européenne), avec des règles d’accès par compte. Les notes de contact peuvent contenir des renseignements sur d’autres personnes.',
      'Tu peux effacer la mémoire synchronisée et supprimer ton compte depuis Réglages > Compte, lorsque l’option est disponible, ou écrire à sevenai.dc@gmail.com.',
    ],
  },
  {
    title: 'Prestataires et paiements',
    text: [
      'Le site et les fonctions de compte dépendent de fournisseurs techniques d’hébergement, d’IA et de base de données. Ils traitent les données nécessaires pour fournir leurs services et peuvent appliquer leurs propres durées de conservation. Six ne contrôle pas les politiques indépendantes de ces fournisseurs.',
      'Si une offre payante est proposée, les informations et le prix sont présentés avant validation. Le paiement est traité par CinetPay; Six reçoit les informations nécessaires au suivi de la transaction, et ne reçoit pas les secrets de paiement saisis chez le prestataire.',
    ],
  },
  {
    title: 'Tes choix et tes droits',
    text: [
      'Tu peux arrêter une analyse, désactiver la mémoire, supprimer tes notes, effacer les notifications locales et demander l’accès ou la suppression des données de ton compte en écrivant à sevenai.dc@gmail.com. Indique l’adresse e-mail ou le numéro associé au compte pour que nous puissions traiter la demande.',
      'Pour protéger tes informations, évite de coller un contenu que tu ne veux pas transmettre à un fournisseur d’IA. Le masquage aide, mais ne garantit pas l’anonymisation.',
    ],
  },
  {
    title: 'Sécurité, changements et contact',
    text: [
      'Les échanges entre l’application et les services en ligne utilisent HTTPS. Aucun dispositif ne peut garantir une sécurité absolue. Nous mettrons cette page à jour lorsque nos pratiques changent de façon importante.',
      'Responsable du service : Seven.AI, projet PBL5, Groupe 7, ULC-Icam, Kinshasa. Contact : sevenai.dc@gmail.com. Dernière mise à jour : 20 octobre 2026.',
    ],
  },
];

export default function Page() {
  return (
    <div className="app">
      <AppBar page="confidentialite" titre="Confidentialité" />
      <main className="screen">
        <h1>Ta confidentialité, expliquée simplement</h1>
        <p className="muted">
          Ce que Six traite, où les données passent et comment tu gardes la main.
        </p>
        <div className="stack">
          {sections.map(({ title, text }) => (
            <section className="card" key={title}>
              <h2 style={{ fontSize: '1.05rem', marginBottom: 4 }}>{title}</h2>
              {text.map((paragraph) => (
                <p className="muted small" style={{ marginTop: 8 }} key={paragraph}>
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
        <div className="card">
          <Link
            href="/conditions"
            className="row sp"
            style={{ textDecoration: 'none', color: 'inherit', minHeight: 44 }}
          >
            <span>Conditions d&apos;utilisation</span>
            <span aria-hidden="true">›</span>
          </Link>
          <Link
            href="/mentions"
            className="row sp"
            style={{ textDecoration: 'none', color: 'inherit', minHeight: 44 }}
          >
            <span>Mentions légales</span>
            <span aria-hidden="true">›</span>
          </Link>
        </div>
      </main>
    </div>
  );
}
