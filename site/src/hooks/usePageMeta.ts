import { useEffect } from "react";
import { useLocation } from "react-router";

// Titre, description, adresse canonique et indexation propres à chaque page. Les valeurs d'index.html
// (celles de l'accueil) sont gardées et remises en place quand on quitte la page.
// Les aperçus des réseaux sociaux (og:…) restent ceux d'index.html : leurs robots ne lisent pas le JavaScript.
// L'adresse est celle où le site est ouvert : elle reste juste quel que soit l'hébergeur ou le nom de domaine.
const SITE = typeof window !== "undefined" ? window.location.origin : "";
const SUFFIX = "Six by Seven.AI";

function meta(selector: string, create: () => HTMLElement) {
  return (document.head.querySelector(selector) as HTMLElement | null) ?? document.head.appendChild(create());
}

type PageMeta = { title?: string; description?: string; noindex?: boolean };

export function usePageMeta({ title, description, noindex = false }: PageMeta) {
  const { pathname } = useLocation();
  useEffect(() => {
    const desc = meta('meta[name="description"]', () => Object.assign(document.createElement("meta"), { name: "description" })) as HTMLMetaElement;
    const canonical = meta('link[rel="canonical"]', () => Object.assign(document.createElement("link"), { rel: "canonical" })) as HTMLLinkElement;
    const before = { title: document.title, desc: desc.content, canonical: canonical.href };

    document.title = title ? `${title} · ${SUFFIX}` : SUFFIX;
    if (description) desc.content = description;
    canonical.href = SITE + pathname;
    // Page introuvable : les moteurs de recherche ne doivent pas la garder.
    const robots = noindex && !document.head.querySelector('meta[name="robots"]') ? document.head.appendChild(Object.assign(document.createElement("meta"), { name: "robots", content: "noindex" })) : null;

    return () => {
      document.title = before.title;
      desc.content = before.desc;
      canonical.href = before.canonical;
      robots?.remove();
    };
  }, [title, description, noindex, pathname]);
}
