#!/usr/bin/env python3
"""Sauvegarde les données de ZEUS dans une archive datée, même pendant que ZEUS tourne.

    python3 sauvegarde-zeus.py [dossier_donnees] [dossier_sauvegardes] [nombre_a_garder]

Par défaut : ./data → ~/zeus-sauvegardes, 7 archives gardées. La base zeus.db est copiée avec l'outil de sauvegarde
de SQLite (une simple copie de fichier pendant une écriture peut donner une base abîmée). Le fichier .env (tes clés)
n'est PAS copié : garde-le à part, en lieu sûr.
"""

from __future__ import annotations

import sqlite3
import sys
import tarfile
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent


def sauvegarder(data: Path, dest: Path, keep: int = 7) -> Path:
    if not data.is_dir():
        raise SystemExit(f"Dossier de données introuvable : {data}")
    dest.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y-%m-%d_%H%M")
    out = dest / f"zeus-{stamp}.tar.gz"
    with tempfile.TemporaryDirectory(prefix="zeus-sauv-") as tmp:
        tmp_db = Path(tmp) / "zeus.db"
        db = data / "zeus.db"
        if db.exists():
            src = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=30)
            dst = sqlite3.connect(str(tmp_db))
            with dst:
                src.backup(dst)
            dst.close()
            src.close()
        partial = out.with_suffix(".partiel")
        with tarfile.open(partial, "w:gz") as tar:
            for p in sorted(data.rglob("*")):
                rel = p.relative_to(data)
                if p.is_dir() or rel.name.startswith("zeus.db") or rel.name == ".env" or "__pycache__" in rel.parts:
                    continue
                tar.add(p, arcname=str(Path("data") / rel))
            if tmp_db.exists():
                tar.add(tmp_db, arcname="data/zeus.db")
        partial.rename(out)  # l'archive n'apparaît que complète
    old = sorted(dest.glob("zeus-*.tar.gz"))
    for p in old[:-keep] if keep > 0 else []:
        p.unlink()
    return out


if __name__ == "__main__":
    data = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else HERE / "data"
    dest = Path(sys.argv[2]).expanduser() if len(sys.argv) > 2 else Path.home() / "zeus-sauvegardes"
    keep = int(sys.argv[3]) if len(sys.argv) > 3 else 7
    out = sauvegarder(data.resolve(), dest.resolve(), keep)
    print(f"Sauvegarde faite : {out} ({out.stat().st_size // 1024} Ko)")
