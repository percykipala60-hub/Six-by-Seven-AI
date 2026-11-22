'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { maskConversation, toneSignals, unmask, type TonResponse } from '@six/shared';
import { ApiError, FAILURE_TEXT, tonSix } from '@/lib/api';
import { useSettings } from '@/lib/settings';
import { Actions, PrimaryButton, SecondaryButton } from '../components/Fil';
import { Card, copyText, LevelGauge, StepHeader, Title } from '../components/ui';

const LEVELS = ['Chaleureux', 'Neutre', 'Sec', 'Agressif'] as const;
const INDEX = { chaleureux: 0, neutre: 1, sec: 2, agressif: 3 } as const;

/** Vérificateur de ton : l'utilisateur écrit seul, Six dit comment ce sera reçu. */
export function ToneChecker({ apiUrl }: { apiUrl: string }) {
  const settings = useSettings();
  const [texte, setTexte] = useState('');
  const [contexte, setContexte] = useState('');
  const [result, setResult] = useState<TonResponse | undefined>();
  const [table, setTable] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const texteRef = useRef<HTMLTextAreaElement>(null);
  const contexteRef = useRef<HTMLTextAreaElement>(null);

  // Téléphone lent (3G, iPhone) : ce qui a été tapé AVANT que l'app soit prête est dans le
  // champ mais pas encore dans l'état. On le récupère, comme dans le parcours « Répondre ».
  useEffect(() => {
    const typed = texteRef.current?.value;
    if (typed) setTexte((current) => current || typed.slice(0, 1200));
    const context = contexteRef.current?.value;
    if (context) setContexte((current) => current || context.slice(0, 1200));
  }, []);

  // Signaux visibles tout de suite, sans réseau.
  const local = useMemo(() => toneSignals(texte), [texte]);

  async function check() {
    setBusy(true);
    setError('');
    setCopied('');
    // Masqué sur le téléphone avant l'envoi : noms, numéros, e-mails.
    const mText = maskConversation(texte);
    const mContext = contexte.trim() ? maskConversation(contexte) : undefined;
    setTable({ ...mText.table, ...mContext?.table });
    try {
      setResult(
        await tonSix(apiUrl, {
          texte: mText.masked,
          langue: settings.langue,
          moteur: settings.moteur,
          ...(mContext ? { contexte: mContext.masked } : {}),
        }),
      );
    } catch (e) {
      const kind = e instanceof ApiError ? e.kind : 'serveur';
      setError(FAILURE_TEXT[kind]);
      // Sans réseau : les signaux du code restent une vraie aide.
      setResult({
        percu: local.minimum,
        explication: local.signaux.length
          ? 'Hors ligne : voici ce que Six repère sans IA.'
          : 'Hors ligne : rien de particulier repéré sans IA.',
        signaux: local.signaux,
        secours: true,
        modele: 'aucun',
        ms: 0,
      });
    } finally {
      setBusy(false);
    }
  }

  async function use(text: string, label: string) {
    await copyText(text);
    setCopied(label);
  }

  const version = result?.version ? unmask(result.version, table) : undefined;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col">
      <StepHeader kicker="Vérificateur de ton" onBack={() => window.history.back()} />
      <Title
        accent="réponse"
        after=" avant d’envoyer"
        sub="Écris ton message. Six te dit comment il sera reçu."
      >
        Relis ta{' '}
      </Title>
      <div className="flex flex-col gap-3 px-5">
        <label className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
            Ton brouillon
          </span>
          <textarea
            ref={texteRef}
            value={texte}
            onChange={(e) => {
              setTexte(e.target.value.slice(0, 1200));
              setResult(undefined);
            }}
            rows={4}
            placeholder="Je t’ai dit que j’envoie à 17h30, arrête de me harceler."
            className="rounded-2xl bg-surface px-4 py-3 text-[15px] ring-1 ring-line"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-[13px] text-muted">Le message auquel tu réponds (facultatif)</span>
          <textarea
            ref={contexteRef}
            value={contexte}
            onChange={(e) => setContexte(e.target.value.slice(0, 1200))}
            rows={2}
            className="rounded-2xl bg-surface px-4 py-3 text-[15px] ring-1 ring-line"
          />
        </label>
        {!result && local.signaux.length ? (
          <ul className="flex flex-col gap-1 text-[13px] text-alert-soft" aria-live="polite">
            {local.signaux.map((s) => (
              <li key={s}>• {s}</li>
            ))}
          </ul>
        ) : null}
        {result ? (
          <>
            <Card label="Ton perçu">
              <LevelGauge levels={LEVELS} index={INDEX[result.percu]} label="Ton perçu" />
              <p className="mt-3 text-[14px]">{result.explication}</p>
              {result.signaux.length ? (
                <ul className="mt-2 flex flex-col gap-1 text-[13px] text-alert-soft">
                  {result.signaux.map((s) => (
                    <li key={s}>• {s}</li>
                  ))}
                </ul>
              ) : null}
            </Card>
            {version ? (
              <Card label="Version plus juste" className="ring-1 ring-accent/50">
                <p className="text-[15px] leading-relaxed">{version}</p>
              </Card>
            ) : null}
          </>
        ) : null}
        {error ? <p className="text-[13px] text-muted">{error}</p> : null}
        {copied ? (
          <p role="status" className="text-[14px] text-accent-soft">
            {copied} copiée. Colle-la dans WhatsApp.
          </p>
        ) : null}
      </div>
      <Actions>
        {!result ? (
          <PrimaryButton onClick={() => void check()} disabled={!texte.trim() || busy}>
            {busy ? 'Six relit…' : 'Vérifier le ton'}
          </PrimaryButton>
        ) : version ? (
          <>
            <PrimaryButton onClick={() => void use(version, 'La version plus juste')}>
              Utiliser cette version
            </PrimaryButton>
            <SecondaryButton onClick={() => void use(texte, 'Ta version')}>
              Garder la mienne
            </SecondaryButton>
          </>
        ) : (
          <PrimaryButton onClick={() => void use(texte, 'Ta version')}>
            Copier mon message
          </PrimaryButton>
        )}
      </Actions>
    </main>
  );
}
