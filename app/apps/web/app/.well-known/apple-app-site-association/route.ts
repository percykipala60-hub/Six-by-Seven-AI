/**
 * Liens universels (iPhone) : un lien https://app.sixbysevenai.com/… s'ouvre dans l'app Six si elle est installée,
 * déjà connectée, au lieu du navigateur. L'app déclare le domaine (App.entitlements : associated-domains).
 */
const APP_ID = '46Z8362D96.com.sevenai.six';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(
    {
      applinks: {
        details: [
          {
            appIDs: [APP_ID],
            // Pas les retours de connexion ni l'API : ils doivent rester dans le navigateur.
            components: [
              { '/': '/api/*', exclude: true },
              { '/': '/connexion/*', exclude: true },
              { '/': '/gmail/*', exclude: true },
              { '/': '/github/*', exclude: true },
              { '/': '/*' },
            ],
          },
        ],
      },
    },
    { headers: { 'cache-control': 'public, max-age=3600' } },
  );
}
