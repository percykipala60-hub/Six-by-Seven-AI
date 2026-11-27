'use client';

import { useEffect, useState } from 'react';
import { Groupe, Ligne, LigneInfo, LigneInterrupteur, LigneLien } from './Liste';
import { PremiumVue } from './Premium';
import { dateFin, lireEtatPremium, type EtatPremium } from '@/lib/premium-client';
import {
  INSTRUCTIONS_MAX,
  autoriserNotifications,
  ecrireInstructions,
  ecrirePrefsNotifications,
  exporterDonneesLocales,
  lireInstructions,
  lirePrefsNotifications,
  telechargerTexte,
} from '@/lib/preferences';
import { LIEN_CONDITIONS, LIEN_CONFIDENTIALITE, LIEN_MENTIONS } from '@/lib/liens';

/**
 * Sections des réglages ajoutées sur le modèle des réglages d'un assistant d'IA de bureau (Compte, Facturation,
 * Utilisation, Votre Six, Notifications, Confidentialité, Application de bureau), avec le design de Six.
 * Chaque réglage montré ici agit vraiment : rien de décoratif.
 */

type Ouvrir = (vue: string) => void;

// ---------- Facturation ----------
export function FacturationVue() {
  const [etat, setEtat] = useState<EtatPremium | null | undefined>(undefined);
  useEffect(() => {
    void lireEtatPremium().then(setEtat);
  }, []);
  if (etat === undefined) return <p className="lg-pied">Chargement…</p>;
  if (etat === null) return <p className="lg-pied">Pas de réseau. Réessayez dans un instant.</p>;
  return (
    <>
      <Groupe titre="Votre forfait">
        <LigneInfo
          icon="sparkles"
          label={etat.premium ? 'Six Premium' : 'Six gratuit'}
          sous={
            etat.premium
              ? `Actif jusqu’au ${dateFin(etat.jusquA)}. Pas de renouvellement automatique.`
              : etat.veille
                ? 'Pendant le lancement, Six est gratuit et sans limite.'
                : `${etat.limites.messages} messages et ${etat.limites.analyses} analyses par jour.`
          }
        />
      </Groupe>
      {etat.veille ? (
        <p className="lg-pied">
          Le paiement n’est pas encore ouvert. Aucun moyen de paiement n’est enregistré et rien
          n’est prélevé.
        </p>
      ) : (
        <PremiumVue />
      )}
    </>
  );
}

// ---------- Utilisation ----------
function Barre({
  label,
  sous,
  utilise,
  limite,
}: {
  label: string;
  sous: string;
  utilise: number;
  limite: number;
}) {
  const part = limite > 0 ? Math.min(100, Math.round((utilise / limite) * 100)) : 0;
  return (
    <div className="lg-ligne lg-statique usage-ligne">
      <span className="lg-txt">
        <span className="lg-label">{label}</span>
        <span className="lg-sous">{sous}</span>
      </span>
      <span className="usage-mesure">
        <span
          className="usage-barre"
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={part}
        >
          <span style={{ width: `${part}%` }} data-plein={part >= 100 || undefined} />
        </span>
        <span className="usage-chiffre">{limite > 0 ? `${part} % utilisés` : 'Sans limite'}</span>
      </span>
    </div>
  );
}

export function UtilisationVue({ onOuvrir }: { onOuvrir: Ouvrir }) {
  const [etat, setEtat] = useState<EtatPremium | null | undefined>(undefined);
  const [maj, setMaj] = useState(0);
  const lire = () => void lireEtatPremium().then((e) => (setEtat(e), setMaj(Date.now())));
  useEffect(lire, []);
  if (etat === undefined) return <p className="lg-pied">Chargement…</p>;
  if (etat === null) return <p className="lg-pied">Pas de réseau. Réessayez dans un instant.</p>;
  const sansLimite = etat.premium || etat.veille;
  const remise = etat.remiseAZero
    ? new Date(etat.remiseAZero).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : '';
  const u = etat.utilise ?? { analyses: 0, messages: 0 };
  const sous = (n: number, limite: number) =>
    sansLimite
      ? `${n} aujourd’hui`
      : `${n} sur ${limite} aujourd’hui${remise ? ` · réinitialisation à ${remise}` : ''}`;
  return (
    <>
      <Groupe
        titre="Limites d’utilisation"
        pied={
          sansLimite
            ? etat.premium
              ? 'Avec Six Premium, vous utilisez Six sans limite.'
              : 'Pendant le lancement, Six est gratuit et sans limite.'
            : 'Les compteurs repartent de zéro chaque jour.'
        }
      >
        <Barre
          label="Messages avec Six"
          sous={sous(u.messages, etat.limites.messages)}
          utilise={u.messages}
          limite={sansLimite ? 0 : etat.limites.messages}
        />
        <Barre
          label="Analyses dans Responsive"
          sous={sous(u.analyses, etat.limites.analyses)}
          utilise={u.analyses}
          limite={sansLimite ? 0 : etat.limites.analyses}
        />
      </Groupe>
      {!sansLimite && etat.paiementDisponible && (
        <Groupe>
          <Ligne icon="haut" label="Passer à Six Premium" onClick={() => onOuvrir('facturation')} />
        </Groupe>
      )}
      <Groupe>
        <Ligne
          icon="refresh"
          label="Actualiser"
          sous={
            maj
              ? `Dernière mise à jour : ${new Date(maj).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
              : undefined
          }
          onClick={lire}
        />
      </Groupe>
    </>
  );
}

// ---------- Votre Six : instructions personnelles ----------
export function InstructionsSix() {
  const [texte, setTexte] = useState('');
  const [garde, setGarde] = useState('');
  useEffect(() => {
    const t = lireInstructions();
    setTexte(t);
    setGarde(t);
  }, []);
  const change = texte.trim() !== garde.trim();
  return (
    <Groupe
      titre="Ce que Six doit savoir de vous"
      pied="Six en tient compte dans le Chat et dans Cosinus. Gardé sur cet appareil, envoyé avec vos messages."
    >
      <div className="lg-bloc">
        <label htmlFor="instructions" className="lg-label">
          Vos préférences
        </label>
        <textarea
          id="instructions"
          className="lg-zone"
          rows={4}
          maxLength={INSTRUCTIONS_MAX}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder="ex. : réponses courtes et directes ; je suis étudiant en génie électrique à Kinshasa"
        />
        <div className="lg-zone-pied">
          <span className="muted small">
            {texte.length} / {INSTRUCTIONS_MAX}
          </span>
          <button
            type="button"
            className="lg-ajout"
            disabled={!change}
            onClick={() => {
              ecrireInstructions(texte);
              setGarde(texte.trim());
              setTexte(texte.trim());
            }}
          >
            {change ? 'Enregistrer' : 'Enregistré'}
          </button>
        </div>
      </div>
    </Groupe>
  );
}

/** Export de tout ce que Six garde sur l'appareil (mémoire, style, préférences), en Markdown. */
export function ExporterDonnees({ titre = 'Vos données' }: { titre?: string }) {
  return (
    <Groupe titre={titre} pied="Un fichier Markdown lisible. Aucune conversation n’y figure.">
      <Ligne
        icon="down"
        label="Exporter mes données"
        sous="Préférences, style d’écriture, contacts, suivis"
        onClick={() => {
          const { nom, contenu } = exporterDonneesLocales();
          telechargerTexte(nom, contenu);
        }}
      />
    </Groupe>
  );
}

// ---------- Notifications ----------
export function NotificationsSixVue({ android, onOuvrir }: { android: boolean; onOuvrir: Ouvrir }) {
  const [fin, setFin] = useState(false);
  const [refus, setRefus] = useState(false);
  useEffect(() => {
    setFin(lirePrefsNotifications().finReponse);
    setRefus(typeof Notification !== 'undefined' && Notification.permission === 'denied');
  }, []);
  const indisponible = typeof Notification === 'undefined';
  return (
    <>
      <Groupe
        titre="Dans l’application"
        pied={
          refus
            ? 'Les notifications sont bloquées pour Six dans les réglages de votre appareil ou de votre navigateur.'
            : indisponible
              ? 'Cet appareil ne permet pas les notifications de Six.'
              : 'Utile pour les tâches longues de Cosinus : Six vous prévient quand il a fini, même si vous êtes ailleurs.'
        }
      >
        <LigneInterrupteur
          id="notif-fin"
          icon="bell"
          label="Fin de réponse"
          sous="Une notification quand Six a répondu et que l’app est en arrière-plan"
          checked={fin}
          disabled={indisponible || refus}
          onChange={async (on) => {
            const ok = on ? await autoriserNotifications() : true;
            setRefus(typeof Notification !== 'undefined' && Notification.permission === 'denied');
            const valeur = on && ok;
            setFin(valeur);
            ecrirePrefsNotifications({ finReponse: valeur });
          }}
        />
      </Groupe>
      <Groupe titre="Par e-mail" pied="Toujours activé : c’est une protection de votre compte.">
        <LigneInfo
          icon="mail"
          label="Alerte de nouvelle connexion"
          sous="Un e-mail quand votre compte s’ouvre sur un nouvel appareil, avec « Ce n’était pas moi »"
        />
      </Groupe>
      {android && (
        <Groupe titre="Android">
          <Ligne
            icon="phone"
            label="Notifications des apps"
            sous="Préparer une réponse depuis une notification WhatsApp, SMS…"
            onClick={() => onOuvrir('apps')}
          />
        </Groupe>
      )}
    </>
  );
}

// ---------- Confidentialité ----------
export function ConfidentialiteVue({ onOuvrir }: { onOuvrir: Ouvrir }) {
  return (
    <>
      <p className="lg-intro">
        Six est conçu pour que vos conversations restent les vôtres. Pour le détail, consultez la
        politique de confidentialité.
      </p>
      <section className="lg">
        <details className="lg-accordeon" open>
          <summary>Comment Six protège vos données</summary>
          <ul>
            <li>
              Dans Responsive, les noms, numéros, adresses et liens sont masqués sur votre appareil
              avant tout envoi.
            </li>
            <li>Le serveur de Six n’enregistre pas le contenu de vos messages.</li>
            <li>
              Vos discussions et la mémoire de Six restent sur cet appareil ; elles ne vont sur
              votre compte que si vous l’autorisez.
            </li>
            <li>Six ne vend pas vos données.</li>
          </ul>
        </details>
        <details className="lg-accordeon">
          <summary>Comment vos données sont utilisées</summary>
          <ul>
            <li>
              Pour vous répondre, le texte passe par le serveur de Six puis par un prestataire
              d’intelligence artificielle : masqué dans Responsive, tel quel dans le Chat et dans
              Cosinus.
            </li>
            <li>Vos conversations ne servent pas à entraîner des modèles d’IA.</li>
            <li>
              Les projets, tâches planifiées et liens de partage sont enregistrés sur votre compte
              (hébergement à Paris, Union européenne).
            </li>
          </ul>
        </details>
      </section>
      <ExporterDonnees />
      <Groupe titre="Gérer">
        <Ligne
          icon="memoire"
          label="Mémoire de Six"
          sous="Voir, couper ou effacer ce que Six retient"
          onClick={() => onOuvrir('votre-six')}
        />
        <Ligne
          icon="partager"
          label="Partages et Cloud"
          sous="Liens de discussion partagés, synchronisation"
          onClick={() => onOuvrir('cloud')}
        />
        <Ligne
          icon="appareils"
          label="Appareils connectés"
          sous="Où votre compte est ouvert"
          onClick={() => onOuvrir('appareils')}
        />
      </Groupe>
      <Groupe titre="Documents">
        <LigneLien
          icon="lock"
          href={LIEN_CONFIDENTIALITE}
          externe
          label="Politique de confidentialité"
        />
        <LigneLien icon="balance" href={LIEN_CONDITIONS} externe label="Conditions d’utilisation" />
        <LigneLien icon="info" href={LIEN_MENTIONS} externe label="Mentions légales" />
      </Groupe>
    </>
  );
}

// ---------- Application de bureau ----------
type PontBureau = {
  reglages?: (c: Record<string, unknown>) => Promise<{
    version: string;
    demarrage: boolean;
    eveil: boolean;
  }>;
};

function pontBureau(): PontBureau | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { sixBureau?: PontBureau }).sixBureau ?? null;
}

export function BureauVue() {
  const [infos, setInfos] = useState<{ version: string; demarrage: boolean; eveil: boolean }>();
  const [erreur, setErreur] = useState('');
  const pont = pontBureau();
  useEffect(() => {
    void pontBureau()
      ?.reglages?.({ action: 'lire' })
      .then(setInfos)
      .catch(() => setErreur('Mettez l’application de bureau à jour pour ces réglages.'));
  }, []);
  const changer = async (c: Record<string, unknown>) => {
    try {
      const r = await pont?.reglages?.(c);
      if (r) setInfos(r);
    } catch {
      setErreur('Le réglage n’a pas pu être changé.');
    }
  };
  if (!pont?.reglages)
    return (
      <p className="lg-pied">
        Ces réglages apparaissent dans l’application Six pour ordinateur. Mettez-la à jour si vous
        l’utilisez déjà.
      </p>
    );
  return (
    <>
      <Groupe>
        <LigneInfo
          icon="ordinateur"
          label="Version de l’application"
          valeur={infos?.version ?? '…'}
        />
      </Groupe>
      <Groupe titre="Démarrage et veille" pied={erreur || undefined}>
        <LigneInterrupteur
          id="bureau-demarrage"
          label="Lancer au démarrage"
          sous="Six s’ouvre quand vous allumez l’ordinateur"
          checked={Boolean(infos?.demarrage)}
          disabled={!infos}
          onChange={(on) => void changer({ action: 'demarrage', valeur: on })}
        />
        <LigneInterrupteur
          id="bureau-eveil"
          label="Garder l’ordinateur éveillé"
          sous="Pendant que Six est ouvert, pour que Cosinus et les tâches continuent ; l’écran peut s’éteindre"
          checked={Boolean(infos?.eveil)}
          disabled={!infos}
          onChange={(on) => void changer({ action: 'eveil', valeur: on })}
        />
      </Groupe>
      <Groupe titre="Raccourcis">
        <LigneInfo label="Ouvrir les réglages" valeur={<kbd>Ctrl ,</kbd>} />
        <LigneInfo label="Envoyer le message" valeur={<kbd>Entrée</kbd>} />
        <LigneInfo label="Aller à la ligne" valeur={<kbd>Maj Entrée</kbd>} />
      </Groupe>
    </>
  );
}
