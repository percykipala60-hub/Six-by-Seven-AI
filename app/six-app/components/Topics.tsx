"use client";

import { useState } from "react";
import { SITUATIONS, type Situation, type TopicsResult } from "@/lib/types";
import { Icon } from "./Icon";
import { AppBar } from "./AppBar";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function Topics() {
  const [situation, setSituation] = useState<Situation>("Briser la glace");
  const [contexte, setContexte] = useState("");
  const [sujets, setSujets] = useState<string[]>([]);
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(-1);

  async function propose() {
    setBusy(true);
    setError("");
    setCopied(-1);
    try {
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ situation, contexte }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<TopicsResult> & { error?: string };
      if (!res.ok || !data.sujets) throw new Error(data.error ?? "Erreur inattendue. Réessaie.");
      setSujets(data.sujets);
      setDemo(Boolean(data.demo));
    } catch (e) {
      setError(e instanceof TypeError ? "Pas de réseau. Réessaie dans un instant." : e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen">
      <AppBar page="sujets" titre="Quoi dire ?" />
      <div className="intro">
        <h1>
          Quoi <em>dire</em> ?
        </h1>
        <p className="muted">Choisis une situation. Six propose des sujets, tu écris le message à ta façon.</p>
      </div>
      <div className="chips" role="group" aria-label="Situation">
        {SITUATIONS.map((s) => (
          <button key={s} className="chip" aria-pressed={situation === s} onClick={() => setSituation(s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="composer">
        <label className="lbl" htmlFor="ctx">Contexte (facultatif, sans nom)</label>
        <input id="ctx" type="text" value={contexte} maxLength={200} onChange={(e) => setContexte(e.target.value)} placeholder="Ex : camarade de classe, on ne s'est pas parlé depuis un mois" />
      </div>
      {demo && <p className="demo">Mode démonstration : sujets génériques, sans IA.</p>}
      {error && <p className="err" role="alert">{error}</p>}
      {sujets.length === 0 && !busy && (
        <p className="privacy">
          <Icon name="bulb" size={16} /> Six propose des idées de sujets, jamais un message tout fait à ta place.
        </p>
      )}
      <div className="stack" aria-live="polite" aria-busy={busy}>
        {sujets.map((s, i) => (
          <div className="card sujet" key={`${i}-${s}`}>
            <span className="ex-ico" aria-hidden="true">
              {i + 1}
            </span>
            <p className="grow">{s}</p>
            <button className={`act${copied === i ? " fait" : ""}`} onClick={async () => setCopied((await copyText(s)) ? i : -1)} aria-label={`Copier le sujet ${i + 1}`}>
              <Icon name={copied === i ? "check" : "copy"} size={16} /> {copied === i ? "Copié" : "Copier"}
            </button>
          </div>
        ))}
      </div>
      <div className="foot">
        <button className="btn primary" onClick={propose} disabled={busy}>
          {busy ? "Six réfléchit…" : sujets.length ? "D'autres sujets" : "Proposer des sujets"}
        </button>
      </div>
    </main>
  );
}
