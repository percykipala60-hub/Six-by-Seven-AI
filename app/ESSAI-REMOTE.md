# Essayer le remote et les comptes sur PC

Utilisez deux comptes de test A et B et une discussion fictive. Dans le projet Supabase de test configuré pour Six, appliquez `app/setup_remote_supabase.sql` depuis SQL Editor. Les scripts habituels de connexion, dont celui du QR, doivent être en place pour tester l’association d’un appareil.

Dans `app/apps/web/.env.local`, définissez `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` avec les valeurs du projet de test. Pour ouvrir les liens depuis un autre appareil, `NEXT_PUBLIC_REMOTE_ORIGIN` peut contenir l’origine HTTPS de votre instance de test accessible aux deux appareils. À défaut, le lien reprend l’origine de la fenêtre qui le crée. Une adresse localhost convient pour deux profils sur le même PC.

Dans PowerShell, depuis `app`, lancez `corepack pnpm dev`. Pour tester le menu des comptes dans la version de bureau, ouvrez une deuxième console dans `app`, fermez l’ancienne instance Six, puis lancez :

```powershell
$env:SIX_URL = 'http://localhost:3000/cosinus'
corepack pnpm bureau
```

1. Dans le Chat ou Cosinus, connectez A, échangez un premier message, ouvrez **Remote** et activez **Privé**. Copiez le lien. Gardez la conversation ouverte sur le poste d’origine.
2. Ouvrez ce lien dans un second profil de navigateur connecté à A. Envoyez un message et vérifiez qu’une seule réponse arrive dans les deux fenêtres. Ouvrez le même lien avec B puis en navigation privée, et vérifiez que le fil reste inaccessible.
3. Désactivez le remote sur le poste d’origine. Le lecteur ouvert doit perdre l’accès à sa prochaine actualisation. Activez **Public**, copiez la nouvelle adresse et vérifiez que B peut suivre les nouveaux messages en lecture seule. Rechargez l’ancienne adresse et vérifiez qu’elle reste révoquée. Répétez sur une seconde conversation pour vérifier l’indépendance des deux liens.
4. Dans Six Bureau, ouvrez le menu de l’avatar, puis **Comptes sur ce PC → Ajouter un compte**. Connectez B par le parcours habituel ou avec un QR approuvé par B. Passez de A à B et vérifiez l’identité affichée ainsi que l’historique de chacun. Six rouvre le profil choisi à chaque permutation.
5. Déconnectez uniquement B et vérifiez que A reste disponible. Ajoutez B à nouveau, choisissez **Déconnecter tous les comptes de ce PC** et vérifiez que Six revient à la connexion. Vérifiez aussi que le téléphone ayant approuvé le QR conserve sa session.
