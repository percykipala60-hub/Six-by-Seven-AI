import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Travail } from './travail';

/** SQLite sur volume persistant : transactions atomiques, y compris après arrêt du serveur. */
export function travailDisponible() {
  return Boolean(process.env.SIX_TRAVAIL_DIR);
}
export async function modifierTravail<T>(fn: (etat: Travail) => T): Promise<T> {
  const dossier = process.env.SIX_TRAVAIL_DIR;
  if (!dossier) throw new Error('Stockage des projets non configuré.');
  await mkdir(dossier, { recursive: true });
  const db = new DatabaseSync(path.join(dossier, 'travail.sqlite'));
  try {
    db.exec(
      'PRAGMA busy_timeout = 5000; CREATE TABLE IF NOT EXISTS travail (id INTEGER PRIMARY KEY CHECK(id = 1), contenu TEXT NOT NULL)',
    );
    db.exec('BEGIN IMMEDIATE');
    try {
      const ligne = db.prepare('SELECT contenu FROM travail WHERE id = 1').get();
      const etat: Travail = ligne ? JSON.parse(String(ligne.contenu)) : { projets: [], taches: [] };
      const resultat = fn(etat);
      db.prepare(
        'INSERT INTO travail(id, contenu) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET contenu = excluded.contenu',
      ).run(JSON.stringify(etat));
      db.exec('COMMIT');
      return resultat;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  } finally {
    db.close();
  }
}
