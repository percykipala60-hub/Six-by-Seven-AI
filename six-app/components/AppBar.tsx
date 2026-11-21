"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ecouterCompte, initiale, lireCompte, type Compte } from "@/lib/compte";
import { Icon } from "./Icon";
import { Logo } from "./Logo";

type Page = "accueil" | "sujets" | "reglages";

/** Bouton rond du profil : initiale (ou silhouette) et pastille d'état, comme Claude Mobile et Gemini. */
export function Avatar({ size = 36 }: { size?: number }) {
  const [c, setC] = useState<Compte>({ statut: "invite", prenom: "" });
  useEffect(() => {
    const lire = () => setC(lireCompte());
    lire();
    return ecouterCompte(lire);
  }, []);
  const etat = c.statut === "connecte" ? "connecté" : "invité, non connecté";
  return (
    <Link href="/reglages?v=compte" className="avatar" style={{ width: size, height: size }} aria-label={`Profil${c.prenom ? ` de ${c.prenom}` : ""} : ${etat}`}>
      {initiale(c) || <Icon name="user" size={Math.round(size * 0.5)} />}
      <span className={`avatar-dot${c.statut === "connecte" ? " on" : ""}`} aria-hidden="true" />
    </Link>
  );
}

/** Barre du haut de l'app : menu latéral à gauche, titre, profil à droite. Remplace la barre d'onglets. */
export function AppBar({ page, titre, onNouvelle }: { page: Page; titre?: string; onNouvelle?: () => void }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Tab" && panel.current) {
        // Le focus reste dans le menu tant qu'il est ouvert.
        const f = panel.current.querySelectorAll<HTMLElement>("a, button");
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
      opener.current?.focus();
    };
  }, [open]);

  const item = (href: string, id: Page | "", icon: "home" | "bulb" | "sliders" | "lock", label: string) => (
    <Link href={href} className="drawer-item" aria-current={id === page ? "page" : undefined} onClick={() => setOpen(false)}>
      <Icon name={icon} /> {label}
    </Link>
  );

  return (
    <>
      <header className="appbar">
        <button ref={opener} className="appbar-btn" aria-label="Ouvrir le menu" aria-expanded={open} aria-controls="six-menu" onClick={() => setOpen(true)}>
          <Icon name="menu" />
        </button>
        <span className="appbar-title">{titre ?? "Six"}</span>
        <Avatar />
      </header>
      <div className={`drawer-scrim${open ? " open" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <div id="six-menu" ref={panel} className={`drawer${open ? " open" : ""}`} role="dialog" aria-modal="true" aria-label="Menu" inert={!open}>
        <div className="drawer-head">
          <Logo small />
          <span className="word">Six</span>
        </div>
        {page === "accueil" && onNouvelle ? (
          <button
            className="drawer-item drawer-new"
            onClick={() => {
              setOpen(false);
              onNouvelle();
            }}
          >
            <Icon name="plus" /> Nouvelle conversation
          </button>
        ) : (
          <Link href="/" className="drawer-item drawer-new" onClick={() => setOpen(false)}>
            <Icon name="plus" /> Nouvelle conversation
          </Link>
        )}
        <nav aria-label="Navigation principale" className="drawer-nav">
          {item("/", "accueil", "home", "Accueil")}
          {item("/sujets", "sujets", "bulb", "Quoi dire ?")}
          {item("/reglages", "reglages", "sliders", "Réglages")}
          {item("/confidentialite", "", "lock", "Confidentialité")}
        </nav>
        <Link href="/reglages?v=compte" className="drawer-profile" onClick={() => setOpen(false)}>
          <ProfilLigne />
        </Link>
      </div>
    </>
  );
}

function ProfilLigne() {
  const [c, setC] = useState<Compte>({ statut: "invite", prenom: "" });
  useEffect(() => {
    const lire = () => setC(lireCompte());
    lire();
    return ecouterCompte(lire);
  }, []);
  return (
    <>
      <span className="avatar avatar-static" aria-hidden="true">
        {initiale(c) || <Icon name="user" size={18} />}
        <span className={`avatar-dot${c.statut === "connecte" ? " on" : ""}`} />
      </span>
      <span className="grow">
        <b>{c.prenom || "Invité"}</b>
        <span className="muted small">{c.statut === "connecte" ? c.email : "Non connecté, tout reste ici"}</span>
      </span>
      <Icon name="chevron" size={18} />
    </>
  );
}
