# Six Premium : en veille jusqu'au RCCM

Six Premium (pass de 7 jours à 3 $ et de 30 jours à 7 $, payé avec MaishaPay par Mobile Money ou carte) est écrit
mais **en veille** : MaishaPay demande un RCCM pour ouvrir un compte marchand, et Seven.AI n'en a pas encore.

## Ce que fait la veille

Le premium est en veille tant que le serveur n'a pas à la fois `MAISHAPAY_PUBLIC_KEY`, `MAISHAPAY_SECRET_KEY`
et `SUPABASE_SERVICE_ROLE_KEY` (`premiumEnVeille()` dans `apps/web/lib/premium.ts`). Pendant la veille :

- aucune limite du jour : analyses et messages Seven AI comme avant ;
- tout le monde rédige avec le meilleur modèle (`CLAUDE_MODEL_REDACTION`) ;
- l'entrée Six Premium est cachée dans les Réglages ;
- la copie de la mémoire sur le compte reste ouverte à tous ;
- les textes légaux du site ne parlent ni de Six Premium ni de MaishaPay.

Ne pas lancer `setup_premium_supabase.sql` pendant la veille : il réserve la copie de la mémoire au premium.

## Le jour du lancement

1. Obtenir le RCCM, ouvrir le compte marchand MaishaPay (https://marchand.maishapay.online) et récupérer les clés.
2. Lancer `setup_premium_supabase.sql` dans Supabase (SQL Editor).
3. Remettre les textes légaux du site avec Six Premium et MaishaPay :
   `git checkout 2bd2ca7 -- site/src/content/legal.ts` (si le fichier a changé depuis, reprendre à la main les
   sections « 4. Six Premium » des conditions et « 6. Paiement de Six Premium » de la confidentialité, ainsi
   que MaishaPay dans les prestataires et la conservation des paiements). Mettre à jour la date en haut du fichier.
4. Dans `deploy/.env` sur le serveur : `SUPABASE_SERVICE_ROLE_KEY`, `MAISHAPAY_PUBLIC_KEY`, `MAISHAPAY_SECRET_KEY`,
   avec `MAISHAPAY_MODE=0` (test). Les autres réglages (prix, limites, modèle gratuit) sont dans
   `deploy/.env.example`.
5. Mettre le serveur à jour (`deploy/LISEZMOI.md`), puis faire un paiement de test et vérifier :
   - les montants : en unités ou en centimes (`MAISHAPAY_MONTANT_CENTIMES`) ;
   - les noms d'opérateurs envoyés à MaishaPay (`FOURNISSEURS` dans `apps/web/lib/maishapay.ts`, surtout
     M-Pesa et Afrimoney) ;
   - la vérification du statut (`/transaction/rest/v2/check`, envoyée en POST) et le retour après une carte.
6. Passer `MAISHAPAY_MODE=1` et relancer.
