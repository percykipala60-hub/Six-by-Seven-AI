/** OTP court pour partager une conversation : « six-xxxxxxxx » (8 lettres minuscules).
 *
 * Stocké dans sessionStorage pendant le run courant, jamais envoyé à un serveur.
 * Le destinataire tape ou colle le code ; l'appelant copie le texte ou scanne un QR.
 */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function octetAléa(): number {
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
    return Math.floor(Math.random() * 256);
  }
  const buf = crypto.getRandomValues(new Uint8Array(1));
  return buf[0] ?? 0;
}

export function générerOTP(): string {
  let code = 'six-';
  for (let i = 0; i < 8; i += 1) {
    const octet = octetAléa();
    const idx = octet % ALPHABET.length;
    code += ALPHABET[idx];
  }
  return code;
}

export function estOTP(valeur: string | undefined): boolean {
  if (!valeur) return false;
  return /^six-[a-z0-9]{8}$/i.test(valeur.trim());
}

export function codeNet(code: string): string {
  return code.trim();
}
