import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard, readJson } from '@/lib/http';
import { utilisateurDeRequete } from '@/lib/supabase-serveur';
import { modifierTravail, travailDisponible } from '@/lib/travail-serveur';
import { ProjetSchema, TacheSchema } from '@/lib/travail';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const commande = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('projet'),
    donnees: ProjetSchema,
    id: z.string().uuid().optional(),
  }),
  z.object({ action: z.literal('tache'), donnees: TacheSchema }),
  z.object({ action: z.literal('etat'), id: z.string().uuid(), etat: z.enum(['pause', 'active']) }),
  z.object({
    action: z.literal('supprimer'),
    id: z.string().uuid(),
    type: z.enum(['projet', 'tache']),
  }),
]);
export async function GET(req: Request) {
  const utilisateur = await utilisateurDeRequete(req);
  if (!utilisateur)
    return NextResponse.json(
      { error: 'Connectez-vous pour retrouver vos projets et vos tâches.' },
      { status: 401 },
    );
  if (!travailDisponible())
    return NextResponse.json(
      { error: 'Le stockage des projets doit être activé sur le serveur.' },
      { status: 503 },
    );
  try {
    return NextResponse.json(
      await modifierTravail((e) => ({
        projets: e.projets.filter((p) => p.proprietaire === utilisateur.id),
        taches: e.taches.filter((t) => t.proprietaire === utilisateur.id),
        planification: Boolean(
          process.env.SIX_CRON_SECRET &&
          e.battement &&
          Date.now() - Date.parse(e.battement) < 180000,
        ),
      })),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'Stockage temporairement indisponible.' }, { status: 503 });
  }
}
export async function POST(req: Request) {
  const bloque = await guard(req);
  if (bloque) return bloque;
  const utilisateur = await utilisateurDeRequete(req);
  if (!utilisateur) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
  if (!travailDisponible())
    return NextResponse.json({ error: 'Stockage non configuré.' }, { status: 503 });
  const parsed = commande.safeParse(await readJson(req, 100000));
  if (!parsed.success)
    return NextResponse.json({ error: 'Vérifiez les champs du formulaire.' }, { status: 400 });
  const c = parsed.data;
  try {
    const resultat = await modifierTravail((e) => {
      if (c.action === 'projet') {
        const ancien = e.projets.find((p) => p.id === c.id && p.proprietaire === utilisateur.id);
        if (c.id && !ancien) throw new Error('Projet introuvable.');
        if (ancien) {
          Object.assign(ancien, c.donnees);
          return ancien;
        }
        if (e.projets.filter((p) => p.proprietaire === utilisateur.id).length >= 50)
          throw new Error('Limite de 50 projets atteinte.');
        const p = {
          ...c.donnees,
          id: randomUUID(),
          proprietaire: utilisateur.id,
          cree: new Date().toISOString(),
        };
        e.projets.push(p);
        return p;
      }
      if (c.action === 'tache') {
        if (
          !process.env.SIX_CRON_SECRET ||
          !e.battement ||
          Date.now() - Date.parse(e.battement) > 180000
        )
          throw new Error('Le moteur de planification n’est pas actif.');
        if (Date.parse(c.donnees.prochaine) <= Date.now())
          throw new Error('Choisissez une date dans le futur.');
        if (e.taches.filter((t) => t.proprietaire === utilisateur.id).length >= 50)
          throw new Error('Limite de 50 tâches atteinte.');
        if (
          c.donnees.projetId &&
          !e.projets.some((p) => p.id === c.donnees.projetId && p.proprietaire === utilisateur.id)
        )
          throw new Error('Projet introuvable.');
        const t = {
          ...c.donnees,
          id: randomUUID(),
          proprietaire: utilisateur.id,
          etat: 'active' as const,
        };
        e.taches.push(t);
        return t;
      }
      if (c.action === 'etat') {
        const t = e.taches.find((t) => t.id === c.id && t.proprietaire === utilisateur.id);
        if (!t) throw new Error('Tâche introuvable.');
        if (t.execution && !t.execution.fin)
          throw new Error('Cette tâche est en cours d’exécution.');
        if (c.etat === 'active' && t.etat === 'terminee')
          throw new Error('Créez une nouvelle tâche pour la relancer.');
        t.etat = c.etat;
        return t;
      }
      if (c.type === 'projet') {
        if (e.taches.some((t) => t.projetId === c.id && t.proprietaire === utilisateur.id))
          throw new Error('Supprime d’abord les tâches de ce projet.');
        e.projets = e.projets.filter((p) => !(p.id === c.id && p.proprietaire === utilisateur.id));
      } else {
        if (
          e.taches.some(
            (t) =>
              t.id === c.id && t.proprietaire === utilisateur.id && t.execution && !t.execution.fin,
          )
        )
          throw new Error('La tâche est en cours d’exécution.');
        e.taches = e.taches.filter((t) => !(t.id === c.id && t.proprietaire === utilisateur.id));
      }
      return { ok: true };
    });
    return NextResponse.json(resultat);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Opération impossible.' },
      { status: 400 },
    );
  }
}
