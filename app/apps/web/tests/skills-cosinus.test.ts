import { expect, it, vi } from 'vitest';
import { choisirSkill, consignesSkill, SKILLS } from '../lib/skills-cosinus';
import { ChatBodySchema } from '../lib/api-schemas';
const ai = vi.hoisted(() => ({
  callChat: vi.fn().mockResolvedValue('Résultat'),
  hasChatAI: () => true,
}));
vi.mock('../lib/ai', () => ({ ...ai, ProviderError: Error }));
import { chat } from '../lib/providers';
it('respecte le choix explicite même si la demande contient un autre sujet', () => {
  expect(choisirSkill('code', 'rapport avec photo')?.id).toBe('code');
});
it('sélectionne une méthode adaptée et laisse une discussion simple sans skill', () => {
  expect(choisirSkill('auto', 'Crée une page HTML')?.id).toBe('web');
  expect(choisirSkill('auto', '', true)?.id).toBe('images');
  expect(choisirSkill('auto', 'bonjour')).toBeUndefined();
});
it('refuse les identifiants non autorisés dans la requête', () => {
  const demande = { mode: 'sixtouch', messages: [{ role: 'user', content: 'Bonjour' }] };
  expect(ChatBodySchema.safeParse({ ...demande, skill: 'inconnu' }).success).toBe(false);
  for (const skill of SKILLS)
    expect(ChatBodySchema.safeParse({ ...demande, skill: skill.id }).success).toBe(true);
});
it('applique les consignes dans Cosinus, sans modifier le Chat ordinaire', async () => {
  await chat([{ role: 'user', content: 'Aide-moi' }], true, undefined, 'sixtouch', 'code');
  expect(ai.callChat.mock.calls.at(-1)?.[0]).toContain(consignesSkill('code'));
  await chat([{ role: 'user', content: 'Aide-moi' }], true, undefined, 'chat', 'code');
  expect(ai.callChat.mock.calls.at(-1)?.[0]).not.toContain('Méthode spécialisée');
});
