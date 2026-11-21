'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Language, Longueur, Moteur, Tone } from '@six/shared';
import { forgetChoices } from '@/lib/choices';
import { ACCENTS, resetAppearance, updateSettings, useSettings, type Accent } from '@/lib/settings';
import { BottomNav, Card, Chip, RadioRow, Segmented, Toggle } from '../components/ui';

const MOTEURS: { value: Moteur; titre: string; hint: string }[] = [
  { value: 'auto', titre: 'Auto (recommandé)', hint: 'Équilibre qualité, vitesse et coût.' },
  { value: 'qualite', titre: 'Qualité maximale', hint: 'Le modèle le plus fin. Un peu plus lent.' },
  { value: 'rapide', titre: 'Rapide et économe', hint: 'Le plus léger. Idéal en 3G.' },
  {
    value: 'confidentiel',
    titre: 'Confidentiel',
    hint: 'Uniquement le serveur de Seven.AI : rien ne part chez un partenaire.',
  },
];
const TONS: { value: Tone; label: string }[] = [
  { value: 'naturel', label: 'Comme d’habitude' },
  { value: 'amical', label: 'Amical' },
  { value: 'professionnel', label: 'Professionnel' },
  { value: 'ferme', label: 'Ferme' },
  { value: 'chaleureux', label: 'Chaleureux' },
  { value: 'court', label: 'Court' },
];
const LONGUEURS: { value: Longueur; label: string }[] = [
  { value: 'court', label: 'Court' },
  { value: 'moyen', label: 'Moyen' },
  { value: 'detaille', label: 'Détaillé' },
];
const LANGUES: { value: Language; label: string }[] = [
  { value: 'fr', label: 'Français' },
  { value: 'ln', label: 'Lingala' },
  { value: 'en', label: 'English' },
];
const THEMES = [
  { value: 'sombre', label: 'Sombre' },
  { value: 'clair', label: 'Clair' },
  { value: 'auto', label: 'Auto' },
] as const;

export function Reglages() {
  const s = useSettings();
  const [forgotten, setForgotten] = useState(false);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col">
      <h1 className="px-5 pt-8 pb-4 font-display text-[30px] font-bold">
        <span className="text-accent">Réglages</span> de Six
      </h1>
      <div className="flex flex-col gap-4 px-5 pb-6">
        <Card label="Apparence">
          <div className="flex flex-col gap-4">
            <Segmented
              value={s.theme}
              options={THEMES}
              onChange={(theme) => updateSettings({ theme })}
              label="Thème"
            />
            <div>
              <p className="mb-2 text-[13px] text-muted">Couleur d’accent</p>
              <div className="flex gap-3" role="radiogroup" aria-label="Couleur d’accent">
                {(Object.keys(ACCENTS) as Accent[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    role="radio"
                    aria-checked={s.accent === a}
                    aria-label={ACCENTS[a].nom}
                    onClick={() => updateSettings({ accent: a })}
                    className={`size-11 rounded-full ring-offset-2 ring-offset-surface ${s.accent === a ? 'ring-3 ring-text' : ''}`}
                    style={{ background: ACCENTS[a].fort }}
                  />
                ))}
              </div>
              <p className="mt-2 text-[12px] text-muted">Bleu Seven.AI par défaut.</p>
            </div>
            <Toggle
              checked={s.contraste}
              onChange={(contraste) => updateSettings({ contraste })}
              label="Contraste élevé"
            />
            <Toggle
              checked={s.grandTexte}
              onChange={(grandTexte) => updateSettings({ grandTexte })}
              label="Grande taille de texte"
            />
            <button
              type="button"
              onClick={resetAppearance}
              className="min-h-11 rounded-2xl text-[14px] text-muted ring-1 ring-line"
            >
              Rétablir le thème par défaut
            </button>
          </div>
        </Card>

        <Card label="Moteur de Six">
          <div role="radiogroup" aria-label="Moteur" className="flex flex-col gap-2">
            {MOTEURS.map((m) => (
              <RadioRow
                key={m.value}
                checked={s.moteur === m.value}
                onSelect={() => updateSettings({ moteur: m.value })}
                hint={m.hint}
              >
                {m.titre}
              </RadioRow>
            ))}
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            Qui fait quoi : la lecture, le masquage, l’anti-arnaque et le contrôle des brouillons
            sont faits par Six (sur ton téléphone et sur notre serveur). La rédaction est faite par
            le modèle choisi. Les clés d’API restent sur le serveur, jamais dans l’app.
          </p>
        </Card>

        <Card label="Réponses">
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-[13px] text-muted">Ton par défaut</p>
              <div className="flex flex-wrap gap-2">
                {TONS.map((t) => (
                  <Chip
                    key={t.value}
                    pressed={s.ton === t.value}
                    onClick={() => updateSettings({ ton: t.value })}
                  >
                    {t.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[13px] text-muted">Longueur par défaut</p>
              <Segmented
                value={s.longueur}
                options={LONGUEURS}
                onChange={(longueur) => updateSettings({ longueur })}
                label="Longueur"
              />
            </div>
            <div>
              <p className="mb-2 text-[13px] text-muted">Langue</p>
              <Segmented
                value={s.langue}
                options={LANGUES}
                onChange={(langue) => updateSettings({ langue })}
                label="Langue"
              />
            </div>
            <Toggle
              checked={s.remettreNoms}
              onChange={(remettreNoms) => updateSettings({ remettreNoms })}
              label="Remettre les vrais noms"
              hint="Dans les brouillons, sur ton téléphone seulement"
            />
            <Toggle
              checked={s.economie}
              onChange={(economie) => updateSettings({ economie })}
              label="Mode économie de données"
              hint="Moins de messages envoyés, une seule demande au serveur"
            />
          </div>
        </Card>

        <Card label="Mes données">
          <p className="text-[14px] text-muted">
            Six garde seulement tes réglages et le nombre de fois où tu choisis chaque type de
            réponse. Aucun texte.
          </p>
          <button
            type="button"
            onClick={() => {
              forgetChoices();
              setForgotten(true);
            }}
            className="mt-3 min-h-11 w-full rounded-2xl text-[14px] text-alert-soft ring-1 ring-alert/50"
          >
            {forgotten ? 'Effacé ✓' : 'Effacer la mémoire de mes choix'}
          </button>
          <Link
            href="/confidentialite"
            className="mt-2 flex min-h-11 items-center justify-center text-[14px] text-accent-soft underline underline-offset-4"
          >
            Confidentialité et mentions légales
          </Link>
        </Card>
      </div>
      <BottomNav />
    </main>
  );
}
