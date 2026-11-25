import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase-serveur', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  utilisateurDeRequete: async (req: Request) =>
    req.headers.get('authorization') === 'Bearer test-token' ? { id: 'test-user' } : null,
}));

const { POST } = await import('@/app/api/chat/transcription/route');

const site = 'http://localhost:3000';
const demande = (body: FormData | undefined, origin = site) =>
  POST(
    new Request(`${site}/api/chat/transcription`, {
      method: 'POST',
      headers: { origin, authorization: 'Bearer test-token' },
      ...(body ? { body } : {}),
    }),
  );

const formAvec = (nom: string, type: string, taille = 1024) => {
  const form = new FormData();
  form.append('audio', new File([new Uint8Array(taille)], nom, { type }));
  return form;
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('route /api/chat/transcription', () => {
  it('transcrit avec le moteur local sans clé OpenAI', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('SIX_TRANSCRIPTION_LOCALE', 'http://127.0.0.1:8765');
    const appel = vi.fn().mockResolvedValue(Response.json({ texte: 'Bonjour Six' }));
    vi.stubGlobal('fetch', appel);
    const res = await demande(formAvec('m.webm', 'audio/webm'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ texte: 'Bonjour Six' });
    expect(appel).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/transcribe',
      expect.objectContaining({ method: 'POST' }),
    );
  });
  it('refuse un autre site (garde commune)', async () => {
    expect((await demande(formAvec('m.webm', 'audio/webm'), 'https://evil.example')).status).toBe(
      403,
    );
  });

  it('refuse les envois sans fichier audio', async () => {
    expect((await demande(new FormData())).status).toBe(400);
    expect((await demande(formAvec('doc.pdf', 'application/pdf'))).status).toBe(400);
  });

  it('refuse un fichier vide', async () => {
    expect((await demande(formAvec('m.webm', 'audio/webm', 0))).status).toBe(400);
  });

  it('dit honnêtement 503 sans clé OpenAI plutôt que de tricher', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const res = await demande(formAvec('m.webm', 'audio/webm'));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/clé OpenAI/);
  });
});
