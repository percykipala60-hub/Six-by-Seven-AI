import { beforeEach, describe, expect, it, vi } from 'vitest';
const { rpc, verifyOtp, getSession } = vi.hoisted(() => ({
  rpc: vi.fn(),
  verifyOtp: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({
  supabase: async () => ({ rpc, auth: { verifyOtp, getSession } }),
}));
vi.mock('../lib/securite', () => ({ noterMethode: vi.fn() }));
import { attendreDemandeQr, lireLienQr } from '../lib/qr-connexion';
const demande = { id: 'a', secret: 'b', expire: Date.now() + 60000 };
describe('Connexion QR dans le profil actif', () => {
  beforeEach(() => vi.resetAllMocks());
  it('distingue le lien remote et le QR de connexion', () =>
    expect(lireLienQr('https://app.sixbysevenai.com/remote/' + crypto.randomUUID())).toBeNull());
  it('utilise le jeton QR approuvé dans la session courante', async () => {
    rpc.mockResolvedValue({ data: [{ statut: 'approuve', token_hash: 'unique' }] });
    verifyOtp.mockResolvedValue({ error: null });
    expect(await attendreDemandeQr(demande)).toBe('connecte');
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'unique', type: 'magiclink' });
  });
  it('ne confirme pas une connexion perdue sans session', async () => {
    rpc.mockResolvedValue({ data: [{ statut: 'approuve', token_hash: 'unique' }] });
    verifyOtp.mockRejectedValue(Error('réseau'));
    getSession.mockResolvedValue({ data: { session: null } });
    expect(await attendreDemandeQr(demande)).toBe('refuse');
  });
});
