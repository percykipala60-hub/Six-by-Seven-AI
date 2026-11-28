/**
 * Liens d'application (Android) : un lien https://app.sixbysevenai.com/… s'ouvre dans l'app Six si elle est
 * installée. Android vérifie l'empreinte SHA-256 du certificat qui signe l'app : ANDROID_CERT_SHA256 (une ou
 * plusieurs, séparées par des virgules ; avec Google Play, celle de « Signature d'application » dans la console).
 */
export const dynamic = 'force-dynamic';

export function GET() {
  const empreintes = (process.env.ANDROID_CERT_SHA256 ?? '')
    .split(',')
    .map((e) => e.trim().toUpperCase())
    .filter((e) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(e));
  return Response.json(
    empreintes.length
      ? [
          {
            relation: ['delegate_permission/common.handle_all_urls'],
            target: {
              namespace: 'android_app',
              package_name: 'com.sevenai.six',
              sha256_cert_fingerprints: empreintes,
            },
          },
        ]
      : [],
    { headers: { 'cache-control': 'public, max-age=3600' } },
  );
}
