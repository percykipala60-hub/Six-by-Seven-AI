"""Outils « Mes documents » : chercher dans la bibliothèque personnelle indexée et citer ses sources."""

from __future__ import annotations

import threading

from ..kb import cite
from ..util import human_size, truncate
from . import ToolContext, ToolError, ToolResult, p, tool


def _lib(ctx: ToolContext):
    return ctx.zeus.library


def _index_with_wait(ctx: ToolContext, wait: float = 40.0) -> str:
    lib = _lib(ctx)
    box: dict = {}
    th = threading.Thread(target=lambda: box.update(lib.index()), daemon=True, name="bibliotheque")
    th.start()
    th.join(wait)
    if th.is_alive():
        st = lib.state
        return (f"Indexation en cours ({st.get('done', 0)}/{st.get('total', 0)} fichiers). Elle continue en "
                f"arrière-plan ; tu peux déjà chercher dans ce qui est prêt.")
    st = box
    if st.get("busy"):
        return "Une indexation est déjà en cours : elle prendra en compte ce changement à la passe suivante."
    s = lib.summary()
    return (f"Bibliothèque à jour : {s['docs']} document(s), {s['chunks']} passage(s) "
            f"({st.get('new', 0)} nouveau(x), {st.get('updated', 0)} modifié(s), {st.get('removed', 0)} retiré(s), "
            f"{st.get('seconds', 0)} s).")


@tool("docs_search",
      "Cherche dans les documents PERSONNELS du propriétaire (cours, notes, PDF, Word, PowerPoint, Excel, e-mails "
      "enregistrés…) indexés dans sa bibliothèque. Renvoie les passages les plus pertinents avec leur source. "
      "Réponds ensuite à partir de ces passages et cite chaque source entre crochets [document, p. X]. Si rien "
      "n'est trouvé, dis-le et propose une autre formulation ; n'invente pas. Utilise docs_read pour lire la suite.",
      {"query": p("string", "Ce que tu cherches, en mots-clés (ex. « théorème de Thévenin », « préavis démission »)"),
       "limit": p("integer", "Nombre de passages (8, max 20)"),
       "folder": p("string", "Limiter à un dossier indexé (facultatif)")},
      required=["query"], toolset="knowledge")
def docs_search(ctx: ToolContext, query: str, limit: int = 8, folder: str = "") -> ToolResult:
    lib = _lib(ctx)
    hits = lib.search(query, max(1, min(20, int(limit or 8))), folder=folder)
    s = lib.summary()
    if not hits:
        if not s["docs"]:
            return ToolResult("La bibliothèque est vide. Demande au propriétaire quel dossier indexer (docs_add_folder), "
                              "ou de déposer ses fichiers dans l'onglet Documents.", data={"hits": []})
        return ToolResult(f"Aucun passage trouvé pour « {query} » dans {s['docs']} document(s). Essaie d'autres "
                          f"mots-clés (synonymes, terme plus général) avant de conclure.", data={"hits": []})
    lines = [f"{len(hits)} passage(s) trouvé(s) dans la bibliothèque ({s['docs']} documents) :"]
    for i, h in enumerate(hits, 1):
        head = f" — {h['heading']}" if h["heading"] else ""
        lines.append(f"\n[{i}] {cite(h)}{head}  (doc_id={h['doc_id']}, passage={h['chunk_id']})\n{h['snippet']}")
    lines.append("\nCite les sources sous la forme [nom du document, p. X]. docs_read(doc_id, chunk=passage) "
                 "donne le passage complet et son contexte.")
    return ToolResult("\n".join(lines), data={"hits": hits})


@tool("docs_read", "Lit un document de la bibliothèque : un passage et ses voisins (chunk), une page (page), ou le "
                   "début du document entier.",
      {"doc_id": p("integer", "Numéro du document (donné par docs_search ou docs_list)"),
       "chunk": p("integer", "Numéro du passage à lire avec son contexte"),
       "page": p("integer", "Numéro de page (PDF)"),
       "around": p("integer", "Passages voisins à inclure autour du passage (1)")},
      required=["doc_id"], toolset="knowledge")
def docs_read(ctx: ToolContext, doc_id: int, chunk: int = 0, page: int = 0, around: int = 1) -> str:
    try:
        r = _lib(ctx).read(int(doc_id), page=int(page or 0), chunk=int(chunk or 0),
                           around=max(0, min(5, int(around if around is not None else 1))))
    except ValueError as e:
        raise ToolError(str(e))
    d = r["doc"]
    if not r["text"]:
        return f"« {d['name']} » : rien à lire ici ({d['error'] or 'page ou passage vide'})."
    return f"Document « {d['name']} » ({d['path']}){', ' + str(d['pages']) + ' pages' if d['pages'] else ''} :\n\n{r['text']}"


@tool("docs_list", "Liste les documents de la bibliothèque (filtre facultatif sur le nom) et les dossiers indexés.",
      {"query": p("string", "Filtrer sur le nom ou le chemin")}, toolset="knowledge")
def docs_list(ctx: ToolContext, query: str = "") -> str:
    lib = _lib(ctx)
    s = lib.summary()
    rows = ctx.db.kb_list_docs(query.strip(), 80)
    head = [f"Bibliothèque : {s['docs']} document(s), {s['chunks']} passages, {human_size(s['bytes'])}."]
    head.append("Dossiers indexés : " + ("; ".join(s["folders"]) if s["folders"] else "aucun")
                + f" (+ dossier de dépôt {s['inbox']}).")
    if not rows:
        return "\n".join(head + ["Aucun document" + (f" pour « {query} »." if query else ".")])
    for d in rows:
        bad = f" ⚠️ {d['error']}" if d["status"] != "ok" else ""
        pages = f", {d['pages']} p." if d["pages"] else ""
        head.append(f"- #{d['id']} {d['name']}{pages} — {truncate(d['path'], 120)}{bad}")
    return "\n".join(head)


@tool("docs_add_folder", "Ajoute un dossier (ou un fichier) à la bibliothèque et l'indexe : ZEUS pourra ensuite "
                         "chercher dedans. Les sous-dossiers sont inclus ; l'index se met à jour tout seul.",
      {"path": p("string", "Chemin du dossier ou du fichier, ex. C:\\Users\\moi\\Documents\\Cours")},
      required=["path"], toolset="knowledge", risk="write", parallel_safe=False)
def docs_add_folder(ctx: ToolContext, path: str) -> str:
    try:
        where, new = _lib(ctx).add_folder(str(ctx.resolve(path)))
    except ValueError as e:
        raise ToolError(str(e))
    ctx.emit("kb_changed")
    note = "ajouté" if new else "déjà indexé"
    return f"« {where} » {note}. " + _index_with_wait(ctx)


@tool("docs_remove_folder", "Retire un dossier ou un fichier de la bibliothèque (les fichiers ne sont pas supprimés, "
                            "seulement oubliés par ZEUS).",
      {"path": p("string", "Chemin exact du dossier ou du fichier indexé")},
      required=["path"], toolset="knowledge", risk="write")
def docs_remove_folder(ctx: ToolContext, path: str) -> str:
    n = _lib(ctx).remove_folder(path)
    ctx.emit("kb_changed")
    return f"Retiré de la bibliothèque ({n} document(s) oublié(s)). Les fichiers eux-mêmes n'ont pas bougé."


@tool("docs_reindex", "Met à jour l'index de la bibliothèque maintenant (nouveaux fichiers, modifiés, supprimés).",
      {"force": p("boolean", "Tout relire même les fichiers inchangés")}, toolset="knowledge", parallel_safe=False)
def docs_reindex(ctx: ToolContext, force: bool = False) -> str:
    if force:
        ctx.db.x("UPDATE kb_docs SET mtime=0")
    return _index_with_wait(ctx)


__all__ = ["docs_search", "docs_read", "docs_list", "docs_add_folder", "docs_remove_folder", "docs_reindex"]
