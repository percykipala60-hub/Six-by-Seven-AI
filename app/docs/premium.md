# Six Premium : achats intégrés Apple

Six Premium (pass de 7 jours et de 30 jours) s'achète uniquement par achat intégré Apple dans l'app iPhone.
Le paiement MaishaPay (Mobile Money et carte sur le site) a été retiré le 23 novembre 2026. Dans l'app Android et
dans le navigateur, l'achat n'est pas proposé : un premium acheté sur iPhone s'y active par le compte.

## Ce que fait la veille

Le premium est en veille tant que le serveur n'a pas à la fois `SUPABASE_SERVICE_ROLE_KEY` et `APPLE_ACHATS=oui`
(`premiumEnVeille()` dans `apps/web/lib/premium.ts`). Pendant la veille :

- aucune limite du jour : analyses et messages Seven AI comme avant ;
- tout le monde rédige avec le meilleur modèle (`CLAUDE_MODEL_REDACTION`) ;
- l'entrée Six Premium est cachée dans les Réglages ;
- la copie de la mémoire sur le compte reste ouverte à tous.

Ne pas lancer `setup_premium_supabase.sql` pendant la veille : il réserve la copie de la mémoire au premium.

## Achats intégrés Apple (app iPhone)

Dans l'app iPhone, Apple impose son achat intégré pour Six Premium (pas d'autre moyen de paiement ni de lien vers le site).
Le code est prêt : module natif `SixAchat` (StoreKit 2, `apps/web/ios/App/App/SceneDelegate.swift`), route
`/api/premium/apple` qui vérifie la transaction signée jusqu'au certificat racine d'Apple (`lib/achat-apple.ts`)
puis prolonge le premium avec `activer_paiement`, une seule fois par transaction (référence `APPLE-<id>`).

Avant d'ouvrir :

1. App Store Connect > Business : mettre à jour l'entité juridique, signer le **contrat relatif aux applications
   payantes**, ajouter le compte bancaire et les formulaires fiscaux. S'inscrire au **Small Business Program**
   (commission de 15 % au lieu de 30 %).
2. App Store Connect > Six > Achats intégrés : **fait le 23 novembre 2026**, deux achats **consommables**
   `com.sevenai.six.premium.7j` (2,99 $) et `com.sevenai.six.premium.30j` (6,99 $), nom et description en français.
   (Le type « abonnement non renouvelable » n'était pas proposé, contrat payant pas encore actif.) Reste, pour la
   vérification d'Apple : une capture d'écran de l'écran Six Premium de l'app iPhone, et les envoyer avec le
   prochain build soumis à l'App Store. Le premium étant gardé sur le compte Six, il se retrouve sur tous les
   appareils ; « Restaurer mes achats » ne revoit pas les consommables déjà terminés, ce qui est normal.
3. Supabase : lancer `setup_premium_supabase.sql` (le canal `apple` y est autorisé).
4. Serveur (`deploy/.env`) : `APPLE_ACHATS=oui`. Pendant les essais TestFlight (achats de test Sandbox) :
   `APPLE_ACHATS_SANDBOX=oui`, à retirer au lancement public, sinon un achat de test donnerait un vrai premium.
5. Envoyer un nouveau build iOS (TestFlight) : le module `SixAchat` n'est que dans les builds suivants.
