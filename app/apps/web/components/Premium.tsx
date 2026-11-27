'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Groupe, LigneChoix, LigneInfo } from './Liste';
import { dansAppNative, dateFin, lireEtatPremium, type EtatPremium } from '@/lib/premium-client';
import {
  acheterApple,
  achatsAppleSurCetAppareil,
  prixApple,
  synchroniserAchatsApple,
  type ResultatAchat,
} from '@/lib/achat-apple-client';

/**
 * Réglages > Six Premium. Pass de 7 ou 30 jours acheté par achat intégré Apple dans l'app iPhone.
 * Ailleurs (Android, navigateur), l'achat n'est pas proposé : le premium acheté sur iPhone s'y active par le compte.
 */

export const EVT_PREMIUM = 'six-premium';

export function PremiumVue() {
  const [etat, setEtat] = useState<EtatPremium | null>(null);
  const [charge, setCharge] = useState(true);
  const [natif, setNatif] = useState(false);
  const [appleIci, setAppleIci] = useState(false);
  const [prixA, setPrixA] = useState<Partial<Record<'7j' | '30j', string>>>({});
  const [offre, setOffre] = useState<'7j' | '30j'>('30j');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');

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
  }, [recharger]);

  function issueAchat(r: ResultatAchat | null, restauration = false) {
    if (!r) {
      if (restauration) setInfo('Aucun achat à restaurer sur cet identifiant Apple.');
      return;
    }
    if (r.etat === 'actif') {
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
  if (!etat) return <p className="lg-pied">Pas de réseau. Réessayez dans un instant.</p>;

  const limites = etat.limites;

  return (
    <>
      <Groupe
        titre={etat.premium ? 'Votre premium' : 'Ce que Six Premium ajoute'}
        pied={
          etat.premium
            ? 'Un nouveau pass s’ajoute à la fin de celui-ci.'
            : 'Pas d’abonnement ni de prélèvement automatique : vous payez un pass, puis vous renouvelez si vous le souhaitez.'
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
          label="Votre mémoire sur tous vos appareils"
          sous="Habitudes, contacts et rappels. Jamais vos conversations."
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

      {natif && appleIci && etat.apple && etat.connecte ? (
        <>
          <Groupe titre="Choisissez votre pass">
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
              Paiement par votre identifiant Apple (Apple Pay ou moyen enregistré). Pass sans
              renouvellement automatique. En achetant, vous acceptez les conditions d’utilisation de
              Six.
            </p>
          </div>
        </>
      ) : natif ? (
        <p className="lg-pied">
          L’achat n’est pas proposé dans l’application. Un premium déjà actif sur votre compte
          s’active ici automatiquement.
        </p>
      ) : !etat.connecte ? (
        <p className="lg-pied">Connectez-vous pour passer à Six Premium.</p>
      ) : (
        <p className="lg-pied">
          Six Premium s’achète dans l’app iPhone. Un premium actif sur votre compte s’active ici
          automatiquement.
        </p>
      )}
    </>
  );
}
