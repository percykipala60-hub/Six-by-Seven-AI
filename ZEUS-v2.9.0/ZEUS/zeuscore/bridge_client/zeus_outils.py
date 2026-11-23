"""Appelle les outils de ZEUS depuis un script Python lancé par ZEUS (outil run_python).

    from zeus_outils import outil, outils, essayer

    print(outil("phone_screen"))                                  # lit l'écran du téléphone
    outil("phone_send_whatsapp", to="Maman", message="J'arrive")  # validation demandée si nécessaire
    r = essayer("web_search", query="taux du dollar à Kinshasa")  # ne lève pas d'exception
    if r.ok:
        print(r)

outil() renvoie le texte du résultat (avec .ok, .images, .fichiers, .donnees) et lève ErreurOutil en cas d'échec.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

__all__ = ["outil", "essayer", "outils", "ErreurOutil", "Resultat"]


class ErreurOutil(Exception):
    """L'outil a échoué ou l'action a été refusée."""


class Resultat(str):
    ok: bool = True
    images: list = []
    fichiers: list = []
    donnees: object = None


def _appel(chemin: str, charge: dict | None = None) -> dict:
    url = os.environ.get("ZEUS_BRIDGE_URL")
    jeton = os.environ.get("ZEUS_BRIDGE_TOKEN")
    if not url or not jeton:
        raise ErreurOutil("zeus_outils ne fonctionne que dans un script lancé par ZEUS (outil run_python).")
    data = json.dumps(charge, ensure_ascii=False).encode("utf-8") if charge is not None else None
    req = urllib.request.Request(url + chemin, data=data, method="POST" if data is not None else "GET",
                                 headers={"X-Zeus-Token": jeton, "Content-Type": "application/json"})
    ouvreur = urllib.request.build_opener(urllib.request.ProxyHandler({}))  # jamais via un proxy
    try:
        with ouvreur.open(req, timeout=3600) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read().decode("utf-8")).get("error") or str(e)
        except Exception:  # noqa: BLE001
            msg = str(e)
        raise ErreurOutil(msg) from None
    except urllib.error.URLError as e:
        raise ErreurOutil(f"ZEUS injoignable : {e.reason}") from None


def essayer(nom: str, **args) -> Resultat:
    """Appelle l'outil `nom` ; ne lève pas d'exception (regarde .ok)."""
    r = _appel("/outil", {"tool": nom, "args": args})
    res = Resultat(r.get("text") or "")
    res.ok = bool(r.get("ok"))
    res.images = list(r.get("images") or [])
    res.fichiers = list(r.get("files") or [])
    res.donnees = r.get("data")
    return res


def outil(nom: str, **args) -> Resultat:
    """Appelle l'outil `nom` avec ses paramètres ; lève ErreurOutil en cas d'échec ou de refus."""
    res = essayer(nom, **args)
    if not res.ok:
        raise ErreurOutil(f"{nom} : {res}")
    return res


def outils() -> list[dict]:
    """Liste des outils disponibles : [{name, description, toolset, parameters}, …]."""
    return _appel("/outils").get("tools") or []
