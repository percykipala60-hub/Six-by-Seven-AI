'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Icon } from './Icon';
import { Groupe, LigneChoix, LigneInfo } from './Liste';
import {
  dansAppNative,
  dateFin,
  entetesCompte,
  lireEtatPremium,
  prix,
  type EtatPremium,
} from '@/lib/premium-client';
import {
  acheterApple,
  achatsAppleSurCetAppareil,
  prixApple,
  synchroniserAchatsApple,
  type ResultatAchat,
} from '@/lib/achat-apple-client';

/**
 * Réglages > Six Premium. Pass de 7 ou 30 jours payé avec MaishaPay (Mobile Money ou carte) sur le site, ou
 * par achat intégré Apple dans l'app iPhone (règles de l'App Store : pas d'autre moyen de paiement proposé dans
 * l'app). Dans l'app Android, l'achat n'est pas proposé : le premium acheté ailleurs s'y active par le compte.
 */

type Canal = 'mobile' | 'carte';
type Operateur = 'airtel' | 'orange' | 'mpesa' | 'afrimoney';
type Attente = { reference: string; canal: Canal } | null;

const OPERATEURS: { id: Operateur; label: string }[] = [
  { id: 'airtel', label: 'Airtel Money' },
  { id: 'orange', label: 'Orange Money' },
  { id: 'mpesa', label: 'M-Pesa (Vodacom)' },
  { id: 'afrimoney', label: 'Afrimoney (Africell)' },
];

const CLE_ATTENTE = 'six-premium-attente';
const INTERVALLE_MS = 5_000;
const ATTENTE_MAX_MS = 4 * 60_000;

export const EVT_PREMIUM = 'six-premium';

function lireAttente(): Attente {
  try {
    const v = JSON.parse(sessionStorage.getItem(CLE_ATTENTE) ?? 'null') as Attente;
    return v && typeof v.reference === 'string' ? v : null;
  } catch {
    return null;
  }
}

function garderAttente(a: Attente) {
  try {
    if (a) sessionStorage.setItem(CLE_ATTENTE, JSON.stringify(a));
    else sessionStorage.removeItem(CLE_ATTENTE);
  } catch {
    /* stockage bloqué */
  }
}

export function PremiumVue() {
  const [etat, setEtat] = useState<EtatPremium | null>(null);
  const [charge, setCharge] = useState(true);
  const [natif, setNatif] = useState(false);
  const [appleIci, setAppleIci] = useState(false);
  const [prixA, setPrixA] = useState<Partial<Record<'7j' | '30j', string>>>({});
  const [offre, setOffre] = useState<'7j' | '30j'>('30j');
  const [canal, setCanal] = useState<Canal>('mobile');
  const [operateur, setOperateur] = useState<Operateur>('airtel');
  const [telephone, setTelephone] = useState('+243');
  const [reseau, setReseau] = useState<'VISA' | 'MASTERCARD'>('VISA');
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [ville, setVille] = useState('Kinshasa');
  const [busy, setBusy] = useState(false);
  const [attente, setAttente] = useState<Attente>(null);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const debutAttente = useRef(0);

  const recharger = useCallback(async () => {
    const e = await lireEtatPremium();
    setEtat(e);
    setCharge(false);
    return e;
  }, []);

  useEffect(() => {
    void recharger();
    void dansAppNative().then(setNatif);
    // App iPhone : prix de l'App Store, et livraison d'un achat resté en suspens (coupure pendant l'achat).
    void achatsAppleSurCetAppareil().then((ok) => {
      setAppleIci(ok);
      if (!ok) return;
      void prixApple().then(setPrixA);
      void synchroniserAchatsApple().then((r) => {
        if (r?.etat === 'actif') {
          window.dispatchEvent(new Event(EVT_PREMIUM));
          void recharger();
        }
      });
    });
    // Retour de la page de paiement par carte (…?v=premium&ref=SIX-…) ou paiement Mobile Money en cours.
    const ref = new URLSearchParams(window.location.search).get('ref');
    const enCours = lireAttente();
    const a: Attente =
      ref && /^SIX-[A-Z0-9-]+$/.test(ref) ? { reference: ref, canal: 'carte' } : enCours;
    if (a) {
      debutAttente.current = Date.now();
      setAttente(a);
    }
  }, [recharger]);

  // Tant qu'un paiement est en attente, le serveur le vérifie auprès de MaishaPay toutes les 5 secondes.
  useEffect(() => {
    if (!attente) return;
    let fini = false;
    let minuterie: ReturnType<typeof setTimeout>;
    const verifier = async () => {
      try {
        const res = await fetch(
          `/api/premium/paiement?ref=${encodeURIComponent(attente.reference)}`,
          { headers: await entetesCompte(), cache: 'no-store' },
        );
        const d = (await res.json().catch(() => ({}))) as {
          statut?: string;
          jusquA?: string | null;
          error?: string;
        };
        if (fini) return;
        if (res.status === 404 || res.status === 400) {
          setErreur(d.error ?? 'Paiement introuvable.');
          return terminer();
        }
        if (d.statut === 'REUSSI') {
          setInfo(`Merci ! Six Premium est actif jusqu’au ${dateFin(d.jusquA ?? null)}.`);
          window.dispatchEvent(new Event(EVT_PREMIUM));
          void recharger();
          return terminer();
        }
        if (d.statut === 'ECHOUE') {
          setErreur(
            'Le paiement n’a pas abouti. Aucun montant n’a été pris pour le premium. Tu peux réessayer.',
          );
          return terminer();
        }
      } catch {
        /* pas de réseau : on réessaie au prochain tour */
      }
      if (Date.now() - debutAttente.current > ATTENTE_MAX_MS) {
        setErreur(
          'Toujours pas de confirmation. Si tu as validé le paiement, rouvre cette page dans quelques minutes : le premium s’activera tout seul.',
        );
        return terminer();
      }
      minuterie = setTimeout(() => void verifier(), INTERVALLE_MS);
    };
    const terminer = () => {
      fini = true;
      garderAttente(null);
      setAttente(null);
      if (window.location.search.includes('ref='))
        window.history.replaceState(null, '', '/reglages?v=premium');
    };
    minuterie = setTimeout(() => void verifier(), attente.canal === 'carte' ? 0 : INTERVALLE_MS);
    return () => {
      fini = true;
      clearTimeout(minuterie);
    };
  }, [attente, recharger]);

  async function payer(e: FormEvent) {
    e.preventDefault();
    setErreur('');
    setInfo('');
    setBusy(true);
    try {
      const corps =
        canal === 'mobile'
          ? { canal, offre, operateur, telephone }
          : { canal, offre, reseau, prenom, nom, telephone, ville };
      const res = await fetch('/api/premium/payer', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(await entetesCompte()) },
        body: JSON.stringify(corps),
      });
      const d = (await res.json().catch(() => ({}))) as {
        reference?: string;
        pagePaiement?: string;
        error?: string;
      };
      if (!res.ok || !d.reference) throw new Error(d.error ?? 'Le paiement n’a pas pu être lancé.');
      const a = { reference: d.reference, canal };
      garderAttente(a);
      if (canal === 'carte' && d.pagePaiement?.startsWith('https://')) {
        window.location.assign(d.pagePaiement); // page sécurisée de MaishaPay, puis retour ici
        return;
      }
      debutAttente.current = Date.now();
      setAttente(a);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur inattendue. Réessaie.');
    } finally {
      setBusy(false);
    }
  }

  function issueAchat(r: ResultatAchat | null, restauration = false) {
    if (!r) {
      if (restauration) setInfo('Aucun achat à restaurer sur cet identifiant Apple.');
      return;
    }
    if (r.etat === 'actif') {
      setInfo(`Merci ! Six Premium est actif jusqu’au ${dateFin(r.jusquA)}.`);
      window.dispatchEvent(new Event(EVT_PREMIUM));
      void recharger();
    } else if (r.etat === 'attente') {
      setInfo(
        'Achat en attente d’approbation (par exemple Demande d’achat). Six s’activera dès qu’il sera validé.',
      );
    } else if (r.etat === 'erreur') {
      setErreur(r.message);
    }
  }

  async function payerApple() {
    setErreur('');
    setInfo('');
    setBusy(true);
    issueAchat(await acheterApple(offre));
    setBusy(false);
  }

  async function restaurerApple() {
    setErreur('');
    setInfo('');
    setBusy(true);
    issueAchat(await synchroniserAchatsApple(true), true);
    setBusy(false);
  }

  if (charge) return <p className="lg-pied">Chargement…</p>;
  if (!etat) return <p className="lg-pied">Pas de réseau. Réessaie dans un instant.</p>;

  const limites = etat.limites;
  const choisie = etat.offres.find((o) => o.id === offre);

  return (
    <>
      <Groupe
        titre={etat.premium ? 'Ton premium' : 'Ce que Six Premium ajoute'}
        pied={
          etat.premium
            ? 'Un nouveau pass s’ajoute à la fin de celui-ci.'
            : 'Pas d’abonnement ni de prélèvement automatique : tu paies un pass, puis tu renouvelles si tu veux.'
        }
      >
        {etat.premium && (
          <LigneInfo
            icon="sparkles"
            label="Six Premium actif"
            sous={`Jusqu’au ${dateFin(etat.jusquA)}`}
          />
        )}
        <LigneInfo
          icon="chat"
          label="Analyses sans limite"
          sous={
            limites.analyses && !etat.veille ? `Gratuit : ${limites.analyses} par jour` : undefined
          }
        />
        <LigneInfo
          icon="sparkles"
          label="Chat avec Six sans limite"
          sous={
            limites.messages && !etat.veille
              ? `Gratuit : ${limites.messages} messages par jour`
              : undefined
          }
        />
        <LigneInfo icon="bulb" label="Le meilleur modèle d’IA" sous="Des réponses plus fines" />
        <LigneInfo
          icon="refresh"
          label="Ta mémoire sur tous tes appareils"
          sous="Habitudes, contacts et rappels. Jamais tes conversations."
        />
      </Groupe>

      {info && (
        <div className="auth-alert-succes" role="status">
          <Icon name="check" size={18} />
          <span>{info}</span>
        </div>
      )}
      {erreur && (
        <div className="auth-alert-err" role="alert">
          <Icon name="alert" size={18} />
          <span>{erreur}</span>
        </div>
      )}

      {attente ? (
        <Groupe titre="Paiement en cours">
          <div className="lg-bloc" role="status" aria-live="polite">
            {attente.canal === 'mobile' ? (
              <>
                <p>
                  Une demande de paiement arrive sur ton téléphone. Valide-la avec ton code PIN,
                  dans le menu de ton opérateur.
                </p>
                <p className="lg-sous">
                  Ne donne jamais ton code PIN à quelqu’un, même s’il dit venir de Six ou de ton
                  opérateur.
                </p>
              </>
            ) : (
              <p>Six vérifie ton paiement par carte…</p>
            )}
          </div>
        </Groupe>
      ) : natif && appleIci && etat.apple && etat.connecte ? (
        <>
          <Groupe titre="Choisis ton pass">
            <div role="radiogroup" aria-label="Pass" className="lg-contenu">
              {etat.offres.map((o) => (
                <LigneChoix
                  key={o.id}
                  label={o.jours === 7 ? '7 jours' : '30 jours'}
                  sous={prixA[o.id] ?? 'Prix de l’App Store…'}
                  choisi={offre === o.id}
                  onClick={() => setOffre(o.id)}
                />
              ))}
            </div>
          </Groupe>
          <div className="lg-bloc">
            <button
              className="btn primary"
              type="button"
              disabled={busy || !prixA[offre]}
              onClick={() => void payerApple()}
            >
              {busy ? 'Achat en cours…' : `Acheter ${prixA[offre] ?? ''}`}
            </button>
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={() => void restaurerApple()}
            >
              Restaurer mes achats
            </button>
            <p className="lg-sous">
              Paiement par ton identifiant Apple (Apple Pay ou moyen enregistré). Pass sans
              renouvellement automatique. En achetant, tu acceptes les conditions d’utilisation de
              Six.
            </p>
          </div>
        </>
      ) : natif ? (
        <p className="lg-pied">
          L’achat n’est pas proposé dans l’application. Un premium déjà actif sur ton compte
          s’active ici automatiquement.
        </p>
      ) : !etat.connecte ? (
        <p className="lg-pied">Connecte-toi pour passer à Six Premium.</p>
      ) : !(etat.maishapay ?? etat.paiementDisponible) ? (
        <p className="lg-pied">Le paiement ouvre bientôt.</p>
      ) : (
        <form onSubmit={payer}>
          <Groupe titre="Choisis ton pass">
            <div role="radiogroup" aria-label="Pass" className="lg-contenu">
              {etat.offres.map((o) => (
                <LigneChoix
                  key={o.id}
                  label={o.jours === 7 ? '7 jours' : '30 jours'}
                  sous={prix(o)}
                  choisi={offre === o.id}
                  onClick={() => setOffre(o.id)}
                />
              ))}
            </div>
          </Groupe>

          <Groupe titre="Payer avec">
            <div role="radiogroup" aria-label="Moyen de paiement" className="lg-contenu">
              <LigneChoix
                label="Mobile Money"
                sous="Airtel, Orange, M-Pesa, Afrimoney"
                choisi={canal === 'mobile'}
                onClick={() => setCanal('mobile')}
              />
              <LigneChoix
                label="Carte bancaire"
                sous="Visa ou Mastercard"
                choisi={canal === 'carte'}
                onClick={() => setCanal('carte')}
              />
            </div>
          </Groupe>

          {canal === 'mobile' ? (
            <Groupe titre="Ton compte Mobile Money">
              <div role="radiogroup" aria-label="Opérateur" className="lg-contenu">
                {OPERATEURS.map((o) => (
                  <LigneChoix
                    key={o.id}
                    label={o.label}
                    choisi={operateur === o.id}
                    onClick={() => setOperateur(o.id)}
                  />
                ))}
              </div>
              <div className="lg-bloc">
                <label htmlFor="premium-tel" className="set-label">
                  Numéro Mobile Money (avec +243)
                </label>
                <input
                  id="premium-tel"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  required
                />
              </div>
            </Groupe>
          ) : (
            <Groupe
              titre="Titulaire de la carte"
              pied="Tu saisiras ta carte sur la page sécurisée de MaishaPay. Six ne voit jamais ton numéro de carte."
            >
              <div role="radiogroup" aria-label="Type de carte" className="lg-contenu">
                <LigneChoix
                  label="Visa"
                  choisi={reseau === 'VISA'}
                  onClick={() => setReseau('VISA')}
                />
                <LigneChoix
                  label="Mastercard"
                  choisi={reseau === 'MASTERCARD'}
                  onClick={() => setReseau('MASTERCARD')}
                />
              </div>
              <div className="lg-bloc">
                <label htmlFor="premium-prenom" className="set-label">
                  Prénom
                </label>
                <input
                  id="premium-prenom"
                  type="text"
                  autoComplete="given-name"
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                  required
                />
                <label htmlFor="premium-nom" className="set-label">
                  Nom
                </label>
                <input
                  id="premium-nom"
                  type="text"
                  autoComplete="family-name"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  required
                />
                <label htmlFor="premium-tel-carte" className="set-label">
                  Téléphone (avec +243)
                </label>
                <input
                  id="premium-tel-carte"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  required
                />
                <label htmlFor="premium-ville" className="set-label">
                  Ville
                </label>
                <input
                  id="premium-ville"
                  type="text"
                  autoComplete="address-level2"
                  value={ville}
                  onChange={(e) => setVille(e.target.value)}
                  required
                />
              </div>
            </Groupe>
          )}

          <div className="lg-bloc">
            <button className="btn primary" type="submit" disabled={busy || !choisie}>
              {busy ? 'Lancement du paiement…' : `Payer ${choisie ? prix(choisie) : ''}`}
            </button>
            <p className="lg-sous">
              Paiement traité par MaishaPay. En payant, tu acceptes les conditions d’utilisation de
              Six.
            </p>
          </div>
        </form>
      )}
    </>
  );
}
