"""Stockage SQLite de ZEUS : conversations, mémoire, compétences, dossiers,
validations, tâches planifiées, journal d'audit. Tout reste sur la machine."""

from __future__ import annotations

import datetime as _dt
import re
import secrets
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

from .util import jdump, jload, keywords, norm

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions(
  id TEXT PRIMARY KEY, channel TEXT, peer TEXT, peer_name TEXT, trust TEXT, title TEXT,
  summary TEXT DEFAULT '', created REAL, updated REAL, meta TEXT DEFAULT '{}');
CREATE INDEX IF NOT EXISTS idx_sessions_peer ON sessions(channel, peer, updated);
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, role TEXT, content TEXT,
  tool_calls TEXT, tool_call_id TEXT, name TEXT, attachments TEXT, archived INTEGER DEFAULT 0,
  created REAL, meta TEXT DEFAULT '{}');
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);
CREATE TABLE IF NOT EXISTS memories(
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, content TEXT, tags TEXT DEFAULT '',
  importance INTEGER DEFAULT 3, created REAL, updated REAL, last_used REAL, uses INTEGER DEFAULT 0,
  source TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS skills(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, description TEXT, content TEXT,
  created REAL, updated REAL, uses INTEGER DEFAULT 0, successes INTEGER DEFAULT 0,
  failures INTEGER DEFAULT 0, source TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS dossiers(
  id TEXT PRIMARY KEY, procedure TEXT, title TEXT, applicant_name TEXT, channel TEXT, contact TEXT,
  status TEXT, priority INTEGER DEFAULT 2, fields TEXT DEFAULT '{}', notes TEXT DEFAULT '',
  created REAL, updated REAL, due REAL, last_relance REAL, relances INTEGER DEFAULT 0,
  assigned TEXT DEFAULT '', session_id TEXT);
CREATE INDEX IF NOT EXISTS idx_dossiers_contact ON dossiers(channel, contact);
CREATE TABLE IF NOT EXISTS documents(
  id INTEGER PRIMARY KEY AUTOINCREMENT, dossier_id TEXT, filename TEXT, path TEXT, sha256 TEXT,
  mime TEXT, size INTEGER, doc_type TEXT, confidence REAL, text TEXT, fields TEXT DEFAULT '{}',
  status TEXT, problem TEXT DEFAULT '', created REAL);
CREATE INDEX IF NOT EXISTS idx_documents_dossier ON documents(dossier_id);
CREATE TABLE IF NOT EXISTS dossier_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT, dossier_id TEXT, ts REAL, kind TEXT, actor TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS approvals(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, session_id TEXT, kind TEXT, tool TEXT, args TEXT,
  risk TEXT, summary TEXT, status TEXT, decided_ts REAL, decided_by TEXT, answer TEXT, options TEXT);
CREATE TABLE IF NOT EXISTS schedules(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, prompt TEXT, spec TEXT, next_run REAL,
  last_run REAL, enabled INTEGER DEFAULT 1, deliver TEXT DEFAULT 'owner', kind TEXT DEFAULT 'agent',
  last_result TEXT DEFAULT '', created REAL, runs INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS audit(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, actor TEXT, action TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS triggers(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, source TEXT DEFAULT 'notification', app TEXT DEFAULT '',
  sender TEXT DEFAULT '', contains TEXT DEFAULT '', action TEXT DEFAULT 'notify', prompt TEXT DEFAULT '',
  deliver TEXT DEFAULT 'owner', enabled INTEGER DEFAULT 1, cooldown INTEGER DEFAULT 60, created REAL,
  last_fired REAL, fires INTEGER DEFAULT 0, last_event TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS usage(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, day TEXT, month TEXT, model_id TEXT, model TEXT, purpose TEXT,
  tokens_in INTEGER DEFAULT 0, tokens_out INTEGER DEFAULT 0, cache_read INTEGER DEFAULT 0,
  cache_write INTEGER DEFAULT 0, cost REAL);
CREATE INDEX IF NOT EXISTS usage_month ON usage(month, day);
CREATE TABLE IF NOT EXISTS flashcards(
  id INTEGER PRIMARY KEY AUTOINCREMENT, deck TEXT, front TEXT, back TEXT, example TEXT DEFAULT '',
  lang TEXT DEFAULT '', ease REAL DEFAULT 2.5, interval REAL DEFAULT 0, reps INTEGER DEFAULT 0,
  lapses INTEGER DEFAULT 0, due REAL, created REAL, last_review REAL);
CREATE INDEX IF NOT EXISTS idx_flashcards_due ON flashcards(deck, due);
CREATE TABLE IF NOT EXISTS progress(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, subject TEXT, topic TEXT, score REAL, notes TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS agenda(
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, start REAL, end REAL, location TEXT DEFAULT '',
  notes TEXT DEFAULT '', attendees TEXT DEFAULT '', reminder_id INTEGER, created REAL);
CREATE INDEX IF NOT EXISTS idx_agenda_start ON agenda(start);
CREATE TABLE IF NOT EXISTS contacts(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT DEFAULT '', email TEXT DEFAULT '',
  company TEXT DEFAULT '', role TEXT DEFAULT '', address TEXT DEFAULT '', notes TEXT DEFAULT '',
  created REAL, updated REAL);
CREATE TABLE IF NOT EXISTS lang_errors(
  id INTEGER PRIMARY KEY AUTOINCREMENT, lang TEXT, category TEXT, error TEXT, correction TEXT, rule TEXT DEFAULT '',
  severity TEXT DEFAULT 'mineure', count INTEGER DEFAULT 1, first_seen REAL, last_seen REAL, card_id INTEGER,
  verified INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_lang_errors ON lang_errors(lang, count);
CREATE TABLE IF NOT EXISTS todos(
  id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, project TEXT DEFAULT '', priority INTEGER DEFAULT 2,
  due REAL, done INTEGER DEFAULT 0, created REAL, done_ts REAL);
CREATE TABLE IF NOT EXISTS kb_docs(
  id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT UNIQUE, name TEXT, folder TEXT, ext TEXT, size INTEGER,
  mtime REAL, pages INTEGER DEFAULT 0, chunks INTEGER DEFAULT 0, status TEXT, error TEXT DEFAULT '', indexed REAL);
CREATE TABLE IF NOT EXISTS kb_chunks(
  id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id INTEGER, ord INTEGER, page INTEGER, heading TEXT DEFAULT '',
  text TEXT);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_doc ON kb_chunks(doc_id, ord);
CREATE TABLE IF NOT EXISTS feedback(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, session_id TEXT, message_id INTEGER, kind TEXT, comment TEXT,
  expected TEXT, status TEXT DEFAULT 'nouveau', model TEXT, role TEXT, case_json TEXT, path TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS placement(
  id TEXT PRIMARY KEY, lang TEXT, state TEXT, created REAL, finished REAL, level TEXT DEFAULT '');
"""

# Colonnes ajoutées après coup (bases créées par une version précédente)
MIGRATIONS = {
    "agenda": {"source": "TEXT DEFAULT ''", "uid": "TEXT DEFAULT ''", "url": "TEXT DEFAULT ''"},
}

FTS_TEMPLATE = """
CREATE VIRTUAL TABLE IF NOT EXISTS {t}_fts USING fts5({cols}, content='{t}', content_rowid='id',
  tokenize='unicode61 remove_diacritics {rd}');
CREATE TRIGGER IF NOT EXISTS {t}_ai AFTER INSERT ON {t} BEGIN
  INSERT INTO {t}_fts(rowid, {cols}) VALUES ({newcols}); END;
CREATE TRIGGER IF NOT EXISTS {t}_ad AFTER DELETE ON {t} BEGIN
  INSERT INTO {t}_fts({t}_fts, rowid, {cols}) VALUES ('delete', {oldcols}); END;
CREATE TRIGGER IF NOT EXISTS {t}_au AFTER UPDATE ON {t} BEGIN
  INSERT INTO {t}_fts({t}_fts, rowid, {cols}) VALUES ('delete', {oldcols});
  INSERT INTO {t}_fts(rowid, {cols}) VALUES ({newcols}); END;
"""

FTS_TABLES = {
    "memories": ["content", "tags"],
    "skills": ["name", "description", "content"],
    "messages": ["content"],
    "kb_chunks": ["heading", "text"],
}


def _row(r: sqlite3.Row | None) -> dict | None:
    return dict(r) if r is not None else None



_SAFE_COL = re.compile(r"^[a-z_][a-z0-9_]*$")


def _check_cols(names) -> None:
    for n in names:
        if not _SAFE_COL.match(n):
            raise ValueError(f"colonne invalide : {n}")


class Store:
    def __init__(self, path: Path):
        self.path = Path(path)
        self._lock = threading.RLock()
        self.db = sqlite3.connect(str(self.path), check_same_thread=False, timeout=30)
        self.db.row_factory = sqlite3.Row
        with self._lock:
            self.db.execute("PRAGMA journal_mode=WAL")
            self.db.execute("PRAGMA synchronous=NORMAL")
            self.db.executescript(SCHEMA)
            self._migrate()
            self.fts = self._init_fts()
            self.db.commit()

    def _migrate(self) -> None:
        for table, cols in MIGRATIONS.items():
            have = {r[1] for r in self.db.execute(f"PRAGMA table_info({table})").fetchall()}
            for col, decl in cols.items():
                if col not in have:
                    self.db.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")
        self.db.execute("CREATE INDEX IF NOT EXISTS idx_agenda_uid ON agenda(source, uid)")

    def _init_fts(self) -> bool:
        for rd in (2, 1):
            try:
                for t, cols in FTS_TABLES.items():
                    self.db.executescript(FTS_TEMPLATE.format(
                        t=t, cols=", ".join(cols), rd=rd,
                        newcols=", ".join(["new.id"] + [f"new.{c}" for c in cols]),
                        oldcols=", ".join(["old.id"] + [f"old.{c}" for c in cols])))
                return True
            except sqlite3.OperationalError:
                continue
        return False

    # ------------------------------------------------------------------ bas niveau
    def q(self, sql: str, args: tuple | list = ()) -> list[dict]:
        with self._lock:
            return [dict(r) for r in self.db.execute(sql, args).fetchall()]

    def one(self, sql: str, args: tuple | list = ()) -> dict | None:
        with self._lock:
            return _row(self.db.execute(sql, args).fetchone())

    def x(self, sql: str, args: tuple | list = ()) -> int:
        with self._lock:
            cur = self.db.execute(sql, args)
            self.db.commit()
            return cur.lastrowid or cur.rowcount

    def close(self) -> None:
        with self._lock:
            self.db.close()

    @staticmethod
    def _fts_query(text: str) -> str:
        words = keywords(text, 10)
        return " OR ".join(f'"{w}"*' for w in words)

    # ------------------------------------------------------------------ kv
    def kv_get(self, key: str, default: Any = None) -> Any:
        r = self.one("SELECT value FROM kv WHERE key=?", (key,))
        return jload(r["value"], default) if r else default

    def kv_set(self, key: str, value: Any) -> None:
        self.x("INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
               (key, jdump(value)))

    # ------------------------------------------------------------------ sessions
    def create_session(self, channel: str, peer: str, trust: str, title: str = "",
                       peer_name: str = "", meta: dict | None = None) -> str:
        sid = f"{channel[:3]}-{secrets.token_hex(5)}"
        t = time.time()
        self.x("INSERT INTO sessions(id,channel,peer,peer_name,trust,title,created,updated,meta) "
               "VALUES(?,?,?,?,?,?,?,?,?)",
               (sid, channel, peer, peer_name, trust, title or "Nouvelle conversation", t, t, jdump(meta or {})))
        return sid

    def get_session(self, sid: str) -> dict | None:
        s = self.one("SELECT * FROM sessions WHERE id=?", (sid,))
        if s:
            s["meta"] = jload(s.get("meta"), {})
        return s

    def find_session(self, channel: str, peer: str, max_age: float | None = None) -> dict | None:
        s = self.one("SELECT * FROM sessions WHERE channel=? AND peer=? ORDER BY updated DESC LIMIT 1",
                     (channel, peer))
        if s and max_age and time.time() - (s["updated"] or 0) > max_age:
            return None
        if s:
            s["meta"] = jload(s.get("meta"), {})
        return s

    def list_sessions(self, limit: int = 50, channel: str | None = None) -> list[dict]:
        if channel:
            rows = self.q("SELECT * FROM sessions WHERE channel=? ORDER BY updated DESC LIMIT ?", (channel, limit))
        else:
            rows = self.q("SELECT * FROM sessions ORDER BY updated DESC LIMIT ?", (limit,))
        for r in rows:
            r["meta"] = jload(r.get("meta"), {})
        return rows

    def update_session(self, sid: str, **fields: Any) -> None:
        if not fields:
            return
        if "meta" in fields and isinstance(fields["meta"], dict):
            fields["meta"] = jdump(fields["meta"])
        fields.setdefault("updated", time.time())
        _check_cols(fields)
        cols = ", ".join(f"{k}=?" for k in fields)
        self.x(f"UPDATE sessions SET {cols} WHERE id=?", (*fields.values(), sid))

    def delete_session(self, sid: str) -> None:
        self.x("DELETE FROM messages WHERE session_id=?", (sid,))
        self.x("DELETE FROM sessions WHERE id=?", (sid,))

    # ------------------------------------------------------------------ messages
    def add_message(self, sid: str, msg: dict) -> int:
        content = msg.get("content")
        if isinstance(content, list):
            content = jdump(content)
        mid = self.x("INSERT INTO messages(session_id,role,content,tool_calls,tool_call_id,name,attachments,created,meta) "
                     "VALUES(?,?,?,?,?,?,?,?,?)",
                     (sid, msg.get("role"), content or "",
                      jdump(msg["tool_calls"]) if msg.get("tool_calls") else None,
                      msg.get("tool_call_id"), msg.get("name"),
                      jdump(msg["attachments"]) if msg.get("attachments") else None,
                      time.time(), jdump(msg.get("meta") or {})))
        self.update_session(sid)
        return mid

    def get_messages(self, sid: str, include_archived: bool = False, limit: int | None = None) -> list[dict]:
        sql = "SELECT * FROM messages WHERE session_id=?"
        if not include_archived:
            sql += " AND archived=0"
        sql += " ORDER BY id"
        rows = self.q(sql, (sid,))
        if limit:
            rows = rows[-limit:]
        out = []
        for r in rows:
            m: dict[str, Any] = {"id": r["id"], "role": r["role"], "created": r["created"]}
            c = r["content"] or ""
            if c.startswith("[{") and '"type"' in c:
                parsed = jload(c)
                m["content"] = parsed if isinstance(parsed, list) else c
            else:
                m["content"] = c
            if r["tool_calls"]:
                m["tool_calls"] = jload(r["tool_calls"], [])
            if r["tool_call_id"]:
                m["tool_call_id"] = r["tool_call_id"]
            if r["name"]:
                m["name"] = r["name"]
            if r["attachments"]:
                m["attachments"] = jload(r["attachments"], [])
            m["meta"] = jload(r.get("meta"), {})
            m["archived"] = r["archived"]
            out.append(m)
        return out

    def archive_messages(self, sid: str, upto_id: int) -> None:
        self.x("UPDATE messages SET archived=1 WHERE session_id=? AND id<=?", (sid, upto_id))

    def search_history(self, query: str, limit: int = 8, trust: str = "owner") -> list[dict]:
        fq = self._fts_query(query)
        if not fq:
            return []
        if self.fts:
            try:
                return self.q(
                    "SELECT m.id, m.session_id, m.role, substr(m.content,1,400) AS content, m.created "
                    "FROM messages_fts f JOIN messages m ON m.id=f.rowid JOIN sessions s ON s.id=m.session_id "
                    "WHERE messages_fts MATCH ? AND s.trust=? AND m.role IN ('user','assistant') "
                    "ORDER BY bm25(messages_fts) LIMIT ?", (fq, trust, limit))
            except sqlite3.OperationalError:
                pass
        w = f"%{keywords(query, 1)[0]}%" if keywords(query, 1) else "%"
        return self.q("SELECT m.id, m.session_id, m.role, substr(m.content,1,400) AS content, m.created "
                      "FROM messages m JOIN sessions s ON s.id=m.session_id WHERE s.trust=? AND "
                      "m.role IN ('user','assistant') AND m.content LIKE ? ORDER BY m.id DESC LIMIT ?",
                      (trust, w, limit))

    # ------------------------------------------------------------------ mémoire
    def add_memory(self, content: str, kind: str = "fait", tags: str = "", importance: int = 3,
                   source: str = "") -> tuple[int, bool]:
        """Ajoute un souvenir ; met à jour au lieu de dupliquer. Renvoie (id, créé?)."""
        content = content.strip()
        n = norm(content)
        for m in self.q("SELECT id, content, tags FROM memories WHERE kind=?", (kind,)):
            mn = norm(m["content"])
            if mn == n or (len(n) > 25 and (n in mn or mn in n)):
                self.x("UPDATE memories SET content=?, tags=?, importance=MAX(importance,?), updated=? WHERE id=?",
                       (content if len(content) > len(m["content"]) else m["content"], tags or m.get("tags", ""),
                        importance, time.time(), m["id"]))
                return m["id"], False
        t = time.time()
        mid = self.x("INSERT INTO memories(kind,content,tags,importance,created,updated,source) VALUES(?,?,?,?,?,?,?)",
                     (kind, content, tags, importance, t, t, source))
        return mid, True

    def search_memories(self, query: str, limit: int = 8) -> list[dict]:
        fq = self._fts_query(query)
        rows: list[dict] = []
        if fq and self.fts:
            try:
                rows = self.q("SELECT m.* FROM memories_fts f JOIN memories m ON m.id=f.rowid "
                              "WHERE memories_fts MATCH ? ORDER BY bm25(memories_fts) - m.importance*0.3 LIMIT ?",
                              (fq, limit))
            except sqlite3.OperationalError:
                rows = []
        if not rows and fq:
            words = keywords(query, 5)
            if words:
                cond = " OR ".join("content LIKE ?" for _ in words)
                rows = self.q(f"SELECT * FROM memories WHERE {cond} ORDER BY importance DESC LIMIT ?",
                              (*[f"%{w}%" for w in words], limit))
        if rows:
            ids = [r["id"] for r in rows]
            self.x(f"UPDATE memories SET uses=uses+1, last_used=? WHERE id IN ({','.join('?' * len(ids))})",
                   (time.time(), *ids))
        return rows

    def core_memories(self, limit: int = 12) -> list[dict]:
        """Souvenirs toujours présents : profil, préférences, importance ≥ 4."""
        return self.q("SELECT * FROM memories WHERE kind IN ('profil','preference') OR importance>=4 "
                      "ORDER BY importance DESC, updated DESC LIMIT ?", (limit,))

    def list_memories(self, limit: int = 200, query: str = "") -> list[dict]:
        if query:
            return self.search_memories(query, limit)
        return self.q("SELECT * FROM memories ORDER BY updated DESC LIMIT ?", (limit,))

    def update_memory(self, mid: int, content: str, kind: str | None = None, importance: int | None = None,
                      tags: str | None = None) -> None:
        cur = self.one("SELECT * FROM memories WHERE id=?", (mid,))
        if not cur:
            return
        self.x("UPDATE memories SET content=?, kind=?, importance=?, tags=?, updated=? WHERE id=?",
               (content, kind or cur["kind"], importance if importance is not None else cur["importance"],
                tags if tags is not None else cur["tags"], time.time(), mid))

    def delete_memory(self, mid: int) -> bool:
        return self.x("DELETE FROM memories WHERE id=?", (mid,)) > 0

    # ------------------------------------------------------------------ compétences
    def upsert_skill(self, name: str, description: str, content: str, source: str = "") -> tuple[int, bool]:
        name = name.strip()
        cur = self.one("SELECT id FROM skills WHERE name=?", (name,))
        t = time.time()
        if cur:
            self.x("UPDATE skills SET description=?, content=?, updated=?, source=COALESCE(NULLIF(?, ''), source) "
                   "WHERE id=?", (description, content, t, source, cur["id"]))
            return cur["id"], False
        sid = self.x("INSERT INTO skills(name,description,content,created,updated,source) VALUES(?,?,?,?,?,?)",
                     (name, description, content, t, t, source))
        return sid, True

    def get_skill(self, name: str) -> dict | None:
        s = self.one("SELECT * FROM skills WHERE name=?", (name,))
        if s:
            return s
        rows = self.search_skills(name, 1)
        return rows[0] if rows else None

    def search_skills(self, query: str, limit: int = 5) -> list[dict]:
        fq = self._fts_query(query)
        if fq and self.fts:
            try:
                return self.q("SELECT s.* FROM skills_fts f JOIN skills s ON s.id=f.rowid "
                              "WHERE skills_fts MATCH ? ORDER BY bm25(skills_fts) LIMIT ?", (fq, limit))
            except sqlite3.OperationalError:
                pass
        words = keywords(query, 4)
        if not words:
            return []
        cond = " OR ".join("(name LIKE ? OR description LIKE ?)" for _ in words)
        args: list[Any] = []
        for w in words:
            args += [f"%{w}%", f"%{w}%"]
        return self.q(f"SELECT * FROM skills WHERE {cond} LIMIT ?", (*args, limit))

    def list_skills(self) -> list[dict]:
        return self.q("SELECT * FROM skills ORDER BY uses DESC, name")

    def record_skill_use(self, name: str, success: bool | None = None) -> None:
        if success is None:
            self.x("UPDATE skills SET uses=uses+1 WHERE name=?", (name,))
        elif success:
            self.x("UPDATE skills SET successes=successes+1 WHERE name=?", (name,))
        else:
            self.x("UPDATE skills SET failures=failures+1 WHERE name=?", (name,))

    def delete_skill(self, name: str) -> bool:
        return self.x("DELETE FROM skills WHERE name=?", (name,)) > 0

    # ------------------------------------------------------------------ dossiers
    def next_dossier_id(self) -> str:
        with self._lock:
            year = _dt.date.today().year
            key = f"dossier_counter_{year}"
            n = int(self.kv_get(key, 0)) + 1
            self.kv_set(key, n)
            return f"D-{year}-{n:04d}"

    def create_dossier(self, procedure: str, title: str, applicant_name: str, channel: str, contact: str,
                       session_id: str = "", due: float | None = None, fields: dict | None = None) -> dict:
        did = self.next_dossier_id()
        t = time.time()
        self.x("INSERT INTO dossiers(id,procedure,title,applicant_name,channel,contact,status,fields,created,updated,due,session_id) "
               "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
               (did, procedure, title, applicant_name, channel, contact, "nouveau", jdump(fields or {}), t, t, due,
                session_id))
        return self.get_dossier(did)  # type: ignore[return-value]

    def get_dossier(self, did: str) -> dict | None:
        d = self.one("SELECT * FROM dossiers WHERE id=?", (did.strip().upper(),))
        if d:
            d["fields"] = jload(d.get("fields"), {})
        return d

    def list_dossiers(self, status: str = "", query: str = "", limit: int = 200, channel: str = "",
                      contact: str = "") -> list[dict]:
        sql = "SELECT * FROM dossiers WHERE 1=1"
        args: list[Any] = []
        if status:
            sts = [s.strip() for s in status.split(",") if s.strip()]
            sql += f" AND status IN ({','.join('?' * len(sts))})"
            args += sts
        if channel:
            sql += " AND channel=?"
            args.append(channel)
        if contact:
            sql += " AND contact=?"
            args.append(contact)
        if query:
            sql += " AND (id LIKE ? OR title LIKE ? OR applicant_name LIKE ? OR contact LIKE ? OR notes LIKE ?)"
            args += [f"%{query}%"] * 5
        sql += " ORDER BY updated DESC LIMIT ?"
        args.append(limit)
        rows = self.q(sql, args)
        for r in rows:
            r["fields"] = jload(r.get("fields"), {})
        return rows

    def update_dossier(self, did: str, **fields: Any) -> None:
        if "fields" in fields and isinstance(fields["fields"], dict):
            fields["fields"] = jdump(fields["fields"])
        fields["updated"] = time.time()
        _check_cols(fields)
        cols = ", ".join(f"{k}=?" for k in fields)
        self.x(f"UPDATE dossiers SET {cols} WHERE id=?", (*fields.values(), did))

    def add_document(self, dossier_id: str, **f: Any) -> int:
        f.setdefault("created", time.time())
        if isinstance(f.get("fields"), dict):
            f["fields"] = jdump(f["fields"])
        cols = ["dossier_id"] + list(f.keys())
        _check_cols(cols)
        return self.x(f"INSERT INTO documents({','.join(cols)}) VALUES({','.join('?' * len(cols))})",
                      (dossier_id, *f.values()))

    def list_documents(self, dossier_id: str) -> list[dict]:
        rows = self.q("SELECT * FROM documents WHERE dossier_id=? ORDER BY id", (dossier_id,))
        for r in rows:
            r["fields"] = jload(r.get("fields"), {})
        return rows

    def get_document(self, doc_id: int) -> dict | None:
        d = self.one("SELECT * FROM documents WHERE id=?", (doc_id,))
        if d:
            d["fields"] = jload(d.get("fields"), {})
        return d

    def update_document(self, doc_id: int, **f: Any) -> None:
        if isinstance(f.get("fields"), dict):
            f["fields"] = jdump(f["fields"])
        _check_cols(f)
        cols = ", ".join(f"{k}=?" for k in f)
        self.x(f"UPDATE documents SET {cols} WHERE id=?", (*f.values(), doc_id))

    def add_dossier_event(self, dossier_id: str, kind: str, actor: str, detail: Any) -> None:
        self.x("INSERT INTO dossier_events(dossier_id,ts,kind,actor,detail) VALUES(?,?,?,?,?)",
               (dossier_id, time.time(), kind, actor, detail if isinstance(detail, str) else jdump(detail)))

    def list_dossier_events(self, dossier_id: str) -> list[dict]:
        return self.q("SELECT * FROM dossier_events WHERE dossier_id=? ORDER BY id", (dossier_id,))

    def dossier_counts(self) -> dict[str, int]:
        return {r["status"]: r["n"] for r in self.q("SELECT status, COUNT(*) n FROM dossiers GROUP BY status")}

    # ------------------------------------------------------------------ validations
    def create_approval(self, session_id: str, kind: str, tool: str, args: dict, risk: str, summary: str,
                        options: list | None = None) -> int:
        return self.x("INSERT INTO approvals(ts,session_id,kind,tool,args,risk,summary,status,options) "
                      "VALUES(?,?,?,?,?,?,?,?,?)",
                      (time.time(), session_id, kind, tool, jdump(args), risk, summary, "pending",
                       jdump(options or [])))

    def get_approval(self, aid: int) -> dict | None:
        a = self.one("SELECT * FROM approvals WHERE id=?", (aid,))
        if a:
            a["args"] = jload(a.get("args"), {})
            a["options"] = jload(a.get("options"), [])
        return a

    def list_approvals(self, status: str = "pending", limit: int = 100) -> list[dict]:
        if status:
            rows = self.q("SELECT * FROM approvals WHERE status=? ORDER BY id DESC LIMIT ?", (status, limit))
        else:
            rows = self.q("SELECT * FROM approvals ORDER BY id DESC LIMIT ?", (limit,))
        for a in rows:
            a["args"] = jload(a.get("args"), {})
            a["options"] = jload(a.get("options"), [])
        return rows

    def decide_approval(self, aid: int, status: str, by: str, answer: str = "") -> bool:
        return self.x("UPDATE approvals SET status=?, decided_ts=?, decided_by=?, answer=? WHERE id=? AND status='pending'",
                      (status, time.time(), by, answer, aid)) > 0

    # ------------------------------------------------------------------ planification
    def add_schedule(self, name: str, prompt: str, spec: str, next_run: float, deliver: str = "owner",
                     kind: str = "agent") -> int:
        return self.x("INSERT INTO schedules(name,prompt,spec,next_run,deliver,kind,created) VALUES(?,?,?,?,?,?,?)",
                      (name, prompt, spec, next_run, deliver, kind, time.time()))

    def list_schedules(self, include_disabled: bool = True) -> list[dict]:
        sql = "SELECT * FROM schedules" + ("" if include_disabled else " WHERE enabled=1") + " ORDER BY next_run"
        return self.q(sql)

    def due_schedules(self, ts: float) -> list[dict]:
        return self.q("SELECT * FROM schedules WHERE enabled=1 AND next_run IS NOT NULL AND next_run<=? ORDER BY next_run",
                      (ts,))

    def update_schedule(self, sid: int, **f: Any) -> None:
        _check_cols(f)
        cols = ", ".join(f"{k}=?" for k in f)
        self.x(f"UPDATE schedules SET {cols} WHERE id=?", (*f.values(), sid))

    def get_schedule(self, sid: int) -> dict | None:
        return self.one("SELECT * FROM schedules WHERE id=?", (sid,))

    def delete_schedule(self, sid: int) -> bool:
        return self.x("DELETE FROM schedules WHERE id=?", (sid,)) > 0

    # ------------------------------------------------------------------ dépenses des modèles
    def add_usage(self, model_id: str, model: str, purpose: str, tokens_in: int, tokens_out: int, cache_read: int,
                  cache_write: int, cost: float | None) -> int:
        t = time.time()
        lt = time.localtime(t)
        return self.x("INSERT INTO usage(ts,day,month,model_id,model,purpose,tokens_in,tokens_out,cache_read,"
                      "cache_write,cost) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                      (t, time.strftime("%Y-%m-%d", lt), time.strftime("%Y-%m", lt), model_id, model, purpose,
                       tokens_in, tokens_out, cache_read, cache_write, cost))

    def usage_total(self, month: str, day: str = "") -> float:
        if day:
            r = self.one("SELECT COALESCE(SUM(cost),0) AS c FROM usage WHERE month=? AND day=?", (month, day))
        else:
            r = self.one("SELECT COALESCE(SUM(cost),0) AS c FROM usage WHERE month=?", (month,))
        return float((r or {}).get("c") or 0)

    def usage_by_model(self, month: str) -> list[dict]:
        return self.q("SELECT model_id, model, COUNT(*) AS calls, SUM(tokens_in) AS tokens_in, SUM(tokens_out) AS "
                      "tokens_out, SUM(cache_read) AS cache_read, SUM(cache_write) AS cache_write, "
                      "ROUND(COALESCE(SUM(cost),0), 4) AS cost, SUM(CASE WHEN cost IS NULL THEN 1 ELSE 0 END) AS "
                      "unpriced FROM usage WHERE month=? GROUP BY model_id, model ORDER BY cost DESC", (month,))

    def usage_by_day(self, days: int = 31) -> list[dict]:
        since = time.time() - days * 86400
        return self.q("SELECT day, ROUND(COALESCE(SUM(cost),0), 4) AS cost, COUNT(*) AS calls FROM usage WHERE ts>=? "
                      "GROUP BY day ORDER BY day", (since,))

    # ------------------------------------------------------------------ déclencheurs
    def add_trigger(self, name: str, app: str = "", sender: str = "", contains: str = "", action: str = "notify",
                    prompt: str = "", deliver: str = "owner", cooldown: int = 60, source: str = "notification") -> int:
        return self.x("INSERT INTO triggers(name,source,app,sender,contains,action,prompt,deliver,cooldown,created) "
                      "VALUES(?,?,?,?,?,?,?,?,?,?)",
                      (name, source, app, sender, contains, action, prompt, deliver, cooldown, time.time()))

    def list_triggers(self, enabled_only: bool = False) -> list[dict]:
        return self.q("SELECT * FROM triggers" + (" WHERE enabled=1" if enabled_only else "") + " ORDER BY id")

    def get_trigger(self, tid: int) -> dict | None:
        return self.one("SELECT * FROM triggers WHERE id=?", (tid,))

    def update_trigger(self, tid: int, **f: Any) -> None:
        _check_cols(f)
        cols = ", ".join(f"{k}=?" for k in f)
        self.x(f"UPDATE triggers SET {cols} WHERE id=?", (*f.values(), tid))

    def delete_trigger(self, tid: int) -> bool:
        return self.x("DELETE FROM triggers WHERE id=?", (tid,)) > 0

    # ------------------------------------------------------------------ cartes mémoire (répétition espacée)
    def add_flashcard(self, deck: str, front: str, back: str, example: str = "", lang: str = "") -> tuple[int, bool]:
        r = self.one("SELECT id FROM flashcards WHERE deck=? AND lower(front)=lower(?)", (deck, front))
        if r:
            self.x("UPDATE flashcards SET back=?, example=? WHERE id=?", (back, example, r["id"]))
            return r["id"], False
        now = time.time()
        return self.x("INSERT INTO flashcards(deck,front,back,example,lang,due,created) VALUES(?,?,?,?,?,?,?)",
                      (deck, front, back, example, lang, now, now)), True

    def due_flashcards(self, deck: str = "", limit: int = 20, now: float | None = None) -> list[dict]:
        now = now or time.time()
        if deck:
            return self.q("SELECT * FROM flashcards WHERE deck=? AND due<=? ORDER BY due LIMIT ?", (deck, now, limit))
        return self.q("SELECT * FROM flashcards WHERE due<=? ORDER BY due LIMIT ?", (now, limit))

    def get_flashcard(self, cid: int) -> dict | None:
        return self.one("SELECT * FROM flashcards WHERE id=?", (cid,))

    def update_flashcard(self, cid: int, **f: Any) -> None:
        _check_cols(f)
        cols = ", ".join(f"{k}=?" for k in f)
        self.x(f"UPDATE flashcards SET {cols} WHERE id=?", (*f.values(), cid))

    def delete_flashcard(self, cid: int) -> bool:
        return self.x("DELETE FROM flashcards WHERE id=?", (cid,)) > 0

    def flashcard_decks(self, now: float | None = None) -> list[dict]:
        now = now or time.time()
        return self.q("SELECT deck, MAX(lang) AS lang, COUNT(*) AS total, SUM(CASE WHEN due<=? THEN 1 ELSE 0 END) AS due, "
                      "SUM(CASE WHEN interval>=21 THEN 1 ELSE 0 END) AS mastered FROM flashcards GROUP BY deck "
                      "ORDER BY deck", (now,))

    def list_flashcards(self, deck: str, limit: int = 500) -> list[dict]:
        return self.q("SELECT * FROM flashcards WHERE deck=? ORDER BY id LIMIT ?", (deck, limit))

    # ------------------------------------------------------------------ journal d'erreurs (langues)
    def add_lang_error(self, lang: str, category: str, error: str, correction: str, rule: str = "",
                       severity: str = "mineure", verified: bool = False) -> tuple[dict, bool]:
        """Ajoute une erreur ; si la même erreur revient, son compteur augmente. Renvoie (ligne, nouvelle ?)."""
        now = time.time()
        r = self.one("SELECT * FROM lang_errors WHERE lang=? AND lower(error)=lower(?)", (lang, error))
        if r:
            self.x("UPDATE lang_errors SET count=count+1, last_seen=?, correction=?, rule=?, category=?, severity=?, "
                   "verified=? WHERE id=?", (now, correction, rule or r["rule"], category or r["category"], severity,
                                            1 if verified else r["verified"], r["id"]))
            return self.one("SELECT * FROM lang_errors WHERE id=?", (r["id"],)) or r, False
        eid = self.x("INSERT INTO lang_errors(lang,category,error,correction,rule,severity,first_seen,last_seen,verified) "
                     "VALUES(?,?,?,?,?,?,?,?,?)", (lang, category, error, correction, rule, severity, now, now,
                                                  1 if verified else 0))
        return self.one("SELECT * FROM lang_errors WHERE id=?", (eid,)) or {}, True

    def set_lang_error_card(self, eid: int, card_id: int) -> None:
        self.x("UPDATE lang_errors SET card_id=? WHERE id=?", (card_id, eid))

    def frequent_errors(self, lang: str = "", limit: int = 5) -> list[dict]:
        if lang:
            return self.q("SELECT * FROM lang_errors WHERE lang=? ORDER BY count DESC, last_seen DESC LIMIT ?",
                          (lang, limit))
        return self.q("SELECT * FROM lang_errors ORDER BY count DESC, last_seen DESC LIMIT ?", (limit,))

    def error_categories(self, lang: str = "") -> list[dict]:
        sql = ("SELECT lang, category, SUM(count) AS n, COUNT(*) AS distinct_errors, MAX(last_seen) AS last_seen "
               "FROM lang_errors")
        if lang:
            return self.q(sql + " WHERE lang=? GROUP BY lang, category ORDER BY n DESC", (lang,))
        return self.q(sql + " GROUP BY lang, category ORDER BY n DESC")

    def delete_lang_error(self, eid: int) -> bool:
        return self.x("DELETE FROM lang_errors WHERE id=?", (eid,)) > 0

    # ------------------------------------------------------------------ progression scolaire
    def add_progress(self, subject: str, topic: str, score: float | None, notes: str = "") -> int:
        return self.x("INSERT INTO progress(ts,subject,topic,score,notes) VALUES(?,?,?,?,?)",
                      (time.time(), subject, topic, score, notes))

    def list_progress(self, subject: str = "", limit: int = 200) -> list[dict]:
        if subject:
            return self.q("SELECT * FROM progress WHERE lower(subject)=lower(?) ORDER BY id DESC LIMIT ?",
                          (subject, limit))
        return self.q("SELECT * FROM progress ORDER BY id DESC LIMIT ?", (limit,))

    # ------------------------------------------------------------------ agenda
    def add_event(self, title: str, start: float, end: float, location: str = "", notes: str = "",
                  attendees: str = "", reminder_id: int | None = None) -> int:
        return self.x("INSERT INTO agenda(title,start,end,location,notes,attendees,reminder_id,created) "
                      "VALUES(?,?,?,?,?,?,?,?)", (title, start, end, location, notes, attendees, reminder_id,
                                                  time.time()))

    def list_events(self, start: float, end: float) -> list[dict]:
        return self.q("SELECT * FROM agenda WHERE end>=? AND start<=? ORDER BY start", (start, end))

    def get_event(self, eid: int) -> dict | None:
        return self.one("SELECT * FROM agenda WHERE id=?", (eid,))

    def update_event(self, eid: int, **f: Any) -> None:
        _check_cols(f)
        cols = ", ".join(f"{k}=?" for k in f)
        self.x(f"UPDATE agenda SET {cols} WHERE id=?", (*f.values(), eid))

    def delete_event(self, eid: int) -> bool:
        return self.x("DELETE FROM agenda WHERE id=?", (eid,)) > 0

    # ------------------------------------------------------------------ agenda : calendriers externes
    def replace_feed_events(self, source: str, events: list[dict]) -> int:
        """Remplace d'un coup les rendez-vous importés d'un calendrier externe (Google, Outlook…)."""
        with self._lock:
            self.db.execute("DELETE FROM agenda WHERE source=?", (source,))
            now = time.time()
            self.db.executemany(
                "INSERT INTO agenda(title,start,end,location,notes,attendees,reminder_id,created,source,uid,url) "
                "VALUES(?,?,?,?,?,?,NULL,?,?,?,?)",
                [(e["title"], e["start"], e["end"], e.get("location", ""), e.get("notes", ""), e.get("attendees", ""),
                  now, source, e.get("uid", ""), e.get("url", "")) for e in events])
            self.db.commit()
        return len(events)

    def delete_feed_events(self, source: str) -> int:
        return self.x("DELETE FROM agenda WHERE source=?", (source,))

    # ------------------------------------------------------------------ bibliothèque de documents
    def kb_save_doc(self, path: str, name: str, folder: str, ext: str, size: int, mtime: float, pages: int,
                    status: str, error: str, chunks: list[dict]) -> int:
        with self._lock:
            old = self.db.execute("SELECT id FROM kb_docs WHERE path=?", (path,)).fetchone()
            if old:
                did = old[0]
                self.db.execute("DELETE FROM kb_chunks WHERE doc_id=?", (did,))
                self.db.execute("UPDATE kb_docs SET name=?, folder=?, ext=?, size=?, mtime=?, pages=?, chunks=?, "
                                "status=?, error=?, indexed=? WHERE id=?",
                                (name, folder, ext, size, mtime, pages, len(chunks), status, error, time.time(), did))
            else:
                did = self.db.execute("INSERT INTO kb_docs(path,name,folder,ext,size,mtime,pages,chunks,status,error,"
                                      "indexed) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                                      (path, name, folder, ext, size, mtime, pages, len(chunks), status, error,
                                       time.time())).lastrowid
            self.db.executemany("INSERT INTO kb_chunks(doc_id,ord,page,heading,text) VALUES(?,?,?,?,?)",
                                [(did, i, c.get("page") or 0, c.get("heading") or "", c["text"])
                                 for i, c in enumerate(chunks)])
            self.db.commit()
            return did

    def kb_delete_doc(self, did: int) -> None:
        with self._lock:
            self.db.execute("DELETE FROM kb_chunks WHERE doc_id=?", (did,))
            self.db.execute("DELETE FROM kb_docs WHERE id=?", (did,))
            self.db.commit()

    def kb_list_docs(self, query: str = "", limit: int = 500) -> list[dict]:
        if query:
            like = f"%{query}%"
            return self.q("SELECT * FROM kb_docs WHERE name LIKE ? OR path LIKE ? ORDER BY name LIMIT ?",
                          (like, like, limit))
        return self.q("SELECT * FROM kb_docs ORDER BY folder, name LIMIT ?", (limit,))

    def kb_search(self, terms: list[str], limit: int = 50, folder: str = "") -> list[dict]:
        """Passages contenant au moins un des mots (préfixes), du plus pertinent au moins pertinent."""
        where_f, args_f = "", []
        if folder:
            where_f = " AND (d.folder=? OR d.path LIKE ?)"
            args_f = [folder, folder.rstrip("\\/") + "%"]
        if self.fts:
            match = " OR ".join(f'"{t}"*' for t in terms)
            try:
                return self.q("SELECT c.id, c.doc_id, c.ord, c.page, c.heading, c.text, d.name, d.path, "
                              "-bm25(kb_chunks_fts, 2.0, 1.0) AS rank FROM kb_chunks_fts "
                              "JOIN kb_chunks c ON c.id = kb_chunks_fts.rowid JOIN kb_docs d ON d.id = c.doc_id "
                              f"WHERE kb_chunks_fts MATCH ?{where_f} ORDER BY bm25(kb_chunks_fts, 2.0, 1.0) LIMIT ?",
                              (match, *args_f, limit))
            except sqlite3.OperationalError:
                pass
        # sans FTS5 : recherche simple (plus lente, sans accents ignorés côté base)
        conds = " OR ".join("c.text LIKE ?" for _ in terms)
        rows = self.q("SELECT c.id, c.doc_id, c.ord, c.page, c.heading, c.text, d.name, d.path FROM kb_chunks c "
                      f"JOIN kb_docs d ON d.id = c.doc_id WHERE ({conds}){where_f} LIMIT ?",
                      (*[f"%{t}%" for t in terms], *args_f, limit * 4))
        for r in rows:
            low = norm(r["text"])
            r["rank"] = float(sum(low.count(t) for t in terms))
        rows.sort(key=lambda r: -r["rank"])
        return rows[:limit]

    # ------------------------------------------------------------------ test de niveau
    def placement_save(self, pid: str, lang: str, state: dict, finished: bool = False, level: str = "") -> None:
        self.x("INSERT INTO placement(id,lang,state,created,finished,level) VALUES(?,?,?,?,?,?) "
               "ON CONFLICT(id) DO UPDATE SET state=excluded.state, finished=excluded.finished, level=excluded.level",
               (pid, lang, jdump(state), time.time(), time.time() if finished else None, level))

    def placement_get(self, pid: str) -> dict | None:
        r = self.one("SELECT * FROM placement WHERE id=?", (pid,))
        if r:
            r["state"] = jload(r["state"], {})
        return r

    def placement_history(self, lang: str = "", limit: int = 20) -> list[dict]:
        if lang:
            return self.q("SELECT id, lang, level, created, finished FROM placement WHERE finished IS NOT NULL AND "
                          "lang=? ORDER BY finished DESC LIMIT ?", (lang, limit))
        return self.q("SELECT id, lang, level, created, finished FROM placement WHERE finished IS NOT NULL "
                      "ORDER BY finished DESC LIMIT ?", (limit,))

    # ------------------------------------------------------------------ carnet d'adresses
    def save_contact(self, name: str, **f: Any) -> tuple[int, bool]:
        _check_cols(f)
        f = {k: v for k, v in f.items() if v not in (None, "")}
        r = self.one("SELECT id FROM contacts WHERE lower(name)=lower(?)", (name,))
        now = time.time()
        if r:
            if f:
                cols = ", ".join(f"{k}=?" for k in f)
                self.x(f"UPDATE contacts SET {cols}, updated=? WHERE id=?", (*f.values(), now, r["id"]))
            return r["id"], False
        cols = ["name", "created", "updated", *f]
        marks = ",".join(["?"] * len(cols))
        return self.x(f"INSERT INTO contacts({','.join(cols)}) VALUES({marks})", (name, now, now, *f.values())), True

    def find_contacts(self, query: str = "", limit: int = 50) -> list[dict]:
        if not query:
            return self.q("SELECT * FROM contacts ORDER BY name LIMIT ?", (limit,))
        like = f"%{query}%"
        return self.q("SELECT * FROM contacts WHERE name LIKE ? OR phone LIKE ? OR email LIKE ? OR company LIKE ? "
                      "OR notes LIKE ? OR role LIKE ? ORDER BY name LIMIT ?", (like, like, like, like, like, like, limit))

    def delete_contact(self, cid: int) -> bool:
        return self.x("DELETE FROM contacts WHERE id=?", (cid,)) > 0

    # ------------------------------------------------------------------ tâches à faire
    def add_todo(self, text: str, project: str = "", priority: int = 2, due: float | None = None) -> int:
        return self.x("INSERT INTO todos(text,project,priority,due,created) VALUES(?,?,?,?,?)",
                      (text, project, priority, due, time.time()))

    def list_todos(self, status: str = "open", project: str = "", limit: int = 200) -> list[dict]:
        where, args = [], []
        if status == "open":
            where.append("done=0")
        elif status == "done":
            where.append("done=1")
        if project:
            where.append("lower(project)=lower(?)")
            args.append(project)
        sql = "SELECT * FROM todos" + (" WHERE " + " AND ".join(where) if where else "")
        return self.q(sql + " ORDER BY done, priority, COALESCE(due, 9e18), id LIMIT ?", (*args, limit))

    def set_todo_done(self, tid: int, done: bool = True) -> bool:
        return self.x("UPDATE todos SET done=?, done_ts=? WHERE id=?",
                      (1 if done else 0, time.time() if done else None, tid)) > 0

    def delete_todo(self, tid: int) -> bool:
        return self.x("DELETE FROM todos WHERE id=?", (tid,)) > 0

    # ------------------------------------------------------------------ audit
    def audit(self, actor: str, action: str, detail: Any) -> None:
        self.x("INSERT INTO audit(ts,actor,action,detail) VALUES(?,?,?,?)",
               (time.time(), actor, action, detail if isinstance(detail, str) else jdump(detail)))

    def list_audit(self, limit: int = 200, query: str = "") -> list[dict]:
        if query:
            return self.q("SELECT * FROM audit WHERE action LIKE ? OR detail LIKE ? ORDER BY id DESC LIMIT ?",
                          (f"%{query}%", f"%{query}%", limit))
        return self.q("SELECT * FROM audit ORDER BY id DESC LIMIT ?", (limit,))

    # ------------------------------------------------------------------ stats
    def stats(self) -> dict[str, Any]:
        def c(sql: str) -> int:
            r = self.one(sql)
            return int(list(r.values())[0]) if r else 0
        return {
            "sessions": c("SELECT COUNT(*) FROM sessions"),
            "messages": c("SELECT COUNT(*) FROM messages"),
            "memories": c("SELECT COUNT(*) FROM memories"),
            "skills": c("SELECT COUNT(*) FROM skills"),
            "dossiers": c("SELECT COUNT(*) FROM dossiers"),
            "approvals_pending": c("SELECT COUNT(*) FROM approvals WHERE status='pending'"),
            "schedules": c("SELECT COUNT(*) FROM schedules WHERE enabled=1"),
            "triggers": c("SELECT COUNT(*) FROM triggers WHERE enabled=1"),
        }

