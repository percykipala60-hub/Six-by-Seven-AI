'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

// Le registre conserve uniquement l'identifiant du profil et la session chiffrée par le système.
function preparerProfils(origine, { app, safeStorage, dialog } = require('electron')) {
  const racine = app.getPath('userData');
  const site = createHash('sha256').update(origine).digest('hex').slice(0, 16);
  const fichier = path.join(racine, 'profils-' + site + '.json');
  let registre = fs.existsSync(fichier)
    ? JSON.parse(fs.readFileSync(fichier, 'utf8'))
    : { actif: 'initial', profils: { initial: {} } };
  const id = registre.actif;
  if (id !== 'initial') {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw Error('Profil Six invalide');
    const dossier = path.join(racine, 'profils', site, id);
    fs.mkdirSync(dossier, { recursive: true });
    app.setPath('userData', dossier);
    app.setPath('sessionData', dossier);
  }
  function sauver(suivant) {
    fs.mkdirSync(racine, { recursive: true });
    fs.writeFileSync(fichier + '.tmp', JSON.stringify(suivant), { mode: 0o600 });
    fs.renameSync(fichier + '.tmp', fichier);
    registre = suivant;
  }
  // Session illisible (clé du système changée, profil copié…) : on l'oublie au lieu de planter ;
  // la personne se reconnecte simplement.
  function dechiffrer(cle, p) {
    try {
      return safeStorage.decryptString(Buffer.from(p.session, 'base64'));
    } catch {
      const profils = { ...registre.profils, [cle]: { proprietaire: p.proprietaire } };
      sauver({ ...registre, profils });
      return null;
    }
  }
  let transition = false;
  return async function commander(action, valeur) {
    if (transition) throw Error('Changement de compte en cours');
    let profils = { ...registre.profils };
    const courant = profils[id];
    if (action === 'liste')
      return Object.entries(profils)
        .filter(([cle, p]) => cle !== id && p.session)
        .map(([cle, p]) => ({ id: cle, nom: p.nom }));
    if (action === 'lire') return courant.session ? dechiffrer(id, courant) : null;
    if (action === 'memoriser') {
      if (typeof valeur !== 'string' || valeur.length > 1000000) throw Error('Session invalide');
      const session = JSON.parse(valeur);
      if (!session.user?.id || !session.refresh_token) throw Error('Session invalide');
      if (courant.proprietaire && courant.proprietaire !== session.user.id)
        throw Error('Utilisez Ajouter un compte pour ouvrir un autre profil.');
      profils[id] = {
        proprietaire: session.user.id,
        session: safeStorage.encryptString(valeur).toString('base64'),
        nom: session.user.email || 'Compte Six',
      };
      sauver({ ...registre, profils });
      return;
    }
    if (action === 'effacer') {
      profils[id] = { proprietaire: courant.proprietaire };
      sauver({ ...registre, profils });
      return;
    }
    let suivant;
    if (action === 'retrouver') {
      const ancien = Object.entries(profils).find(
        ([cle, p]) => cle !== id && p.proprietaire === courant.proprietaire,
      );
      if (!ancien || !courant.session) return;
      const texte = dechiffrer(id, courant);
      if (!texte) return;
      const session = JSON.parse(texte);
      const base =
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://omlrwtzfqmfwjmwxmehe.supabase.co';
      const r = await fetch(new URL('/auth/v1/user', base), {
        headers: { apikey: valeur, Authorization: 'Bearer ' + session.access_token },
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok || (await r.json()).id !== ancien[1].proprietaire)
        throw Error('Identité du compte non confirmée.');
      if (transition || registre.profils[id] !== courant) return;
      profils = { ...registre.profils, [ancien[0]]: courant };
      profils = Object.fromEntries(Object.entries(profils).filter(([cle]) => cle !== id));
      sauver({ actif: ancien[0], profils });
      transition = true;
      app.relaunch();
      app.quit();
      return;
    }
    if (action === 'choisir' && Object.hasOwn(profils, valeur) && profils[valeur]?.session)
      suivant = valeur;
    else if (action === 'ajouter' || action === 'quitter' || action === 'tout-quitter') {
      if (action === 'tout-quitter') {
        const choix = dialog.showMessageBoxSync({
          type: 'question',
          message: 'Déconnecter tous les comptes Six de ce PC ?',
          buttons: ['Annuler', 'Déconnecter'],
          defaultId: 0,
          cancelId: 0,
        });
        if (choix !== 1) return;
        profils = Object.fromEntries(
          Object.entries(profils)
            .filter(([, p]) => p.proprietaire)
            .map(([cle, p]) => [cle, { proprietaire: p.proprietaire }]),
        );
      }
      if (action === 'quitter') profils[id] = { proprietaire: courant.proprietaire };
      suivant = action === 'quitter' && Object.keys(profils).find((cle) => profils[cle].session);
      if (!suivant) {
        suivant = randomUUID();
        profils[suivant] = {};
      }
    } else throw Error('Commande de compte inconnue');
    sauver({ actif: suivant, profils });
    transition = true;
    app.relaunch();
    app.quit();
  };
}
module.exports = { preparerProfils };
