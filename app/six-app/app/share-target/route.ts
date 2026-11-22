// Repli quand le service worker n'est pas actif (navigateur de bureau, première visite) :
// on ne lit JAMAIS le contenu partagé côté serveur, on renvoie simplement l'utilisateur vers l'écran WhatsApp.
function back() {
  return new Response(null, { status: 303, headers: { Location: "/?action=whatsapp" } });
}

export function POST() {
  return back();
}

export function GET() {
  return back();
}
