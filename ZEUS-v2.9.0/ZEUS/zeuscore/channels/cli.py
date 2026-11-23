"""Discussion avec ZEUS dans le terminal (avec streaming, outils et validations)."""

from __future__ import annotations

import queue
import sys
import threading
import time
from typing import TYPE_CHECKING

from ..security import risk_label
from ..util import truncate

if TYPE_CHECKING:  # pragma: no cover
    from ..core import Zeus

C = {"dim": "\033[2m", "b": "\033[1m", "y": "\033[33m", "c": "\033[36m", "g": "\033[32m", "r": "\033[31m", "0": "\033[0m"}
if not sys.stdout.isatty():
    C = {k: "" for k in C}


def run_cli(zeus: "Zeus") -> None:
    sid = zeus.owner_session("cli", "owner")
    name = zeus.config.assistant_name
    print(f"{C['y']}{C['b']}⚡ {name}{C['0']} — tape ton message. Commandes : /nouveau /stop /autonomie <mode> /quitter\n")
    q = zeus.bus.subscribe()
    while True:
        try:
            text = input(f"{C['c']}toi ›{C['0']} ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not text:
            continue
        low = text.lower()
        if low in ("/q", "/quit", "/quitter", "exit", "quit"):
            break
        if low in ("/nouveau", "/new"):
            sid = zeus.db.create_session("cli", "owner", "owner")
            print("🆕 Nouvelle conversation.")
            continue
        if low.startswith("/autonomie"):
            parts = text.split()
            if len(parts) > 1 and parts[1] in ("prudent", "equilibre", "autonome"):
                zeus.config.set("security.autonomy", parts[1])
            print(f"Autonomie : {zeus.security.autonomy}")
            continue
        while not q.empty():
            q.get_nowait()
        done = threading.Event()
        result: dict = {}

        def work() -> None:
            result["r"] = zeus.chat(sid, text)
            done.set()

        threading.Thread(target=work, daemon=True).start()
        streaming = False
        buf: list[str] = []
        try:
            while not done.is_set() or not q.empty():
                try:
                    ev = q.get(timeout=0.2)
                except queue.Empty:
                    continue
                if ev.get("session_id") not in (sid, None) and ev.get("type") not in ("approval",):
                    if ev.get("depth", 0) == 0:
                        continue
                t = ev["type"]
                if t == "assistant_delta" and ev.get("depth", 0) == 0:
                    if not streaming:
                        print(f"{C['y']}{name} ›{C['0']} ", end="")
                        streaming = True
                    print(ev["text"], end="", flush=True)
                    buf.append(ev["text"])
                elif t == "assistant_reset":
                    if streaming:
                        print()
                    streaming = False
                    buf.clear()
                elif t == "tool_start":
                    buf.clear()
                    if streaming:
                        print()
                        streaming = False
                    args = truncate(str(ev.get("args")), 140)
                    indent = "  " * (ev.get("depth", 0) + 1)
                    print(f"{C['dim']}{indent}⚙ {ev['name']} {args}{C['0']}")
                elif t == "model_notice" and ev.get("depth", 0) == 0:
                    if streaming:
                        print()
                        streaming = False
                    print(f"{C['dim']}  {ev['text']}{C['0']}")
                elif t == "tool_end" and not ev.get("ok"):
                    print(f"{C['r']}    ✗ {truncate(ev.get('preview', ''), 200)}{C['0']}")
                elif t == "approval":
                    a = ev["approval"]
                    if streaming:
                        print()
                        streaming = False
                    if a.get("kind") == "question":
                        opts = a.get("options") or []
                        ans = input(f"{C['b']}❓ {a['summary']}{' (' + ' / '.join(opts) + ')' if opts else ''}\n   ta réponse › {C['0']}")
                        zeus.approvals.decide(a["id"], "answer", "cli", ans)
                    else:
                        print(f"{C['y']}{C['b']}⚠ Validation — {risk_label(a.get('risk', ''))}{C['0']}\n   {a['summary']}")
                        ans = input("   Autoriser ? [o]ui / [n]on / [t]oujours › ").strip().lower()
                        dec = "always" if ans.startswith("t") else ("approve" if ans.startswith(("o", "y")) else "deny")
                        zeus.approvals.decide(a["id"], dec, "cli")
                elif t == "run_end" and ev.get("depth", 0) == 0 and ev.get("session_id") == sid:
                    if streaming:
                        print()
                        streaming = False
        except KeyboardInterrupt:
            zeus.stop_run(sid)
            print("\n⏹️ Arrêt demandé…")
            done.wait(10)
        r = result.get("r")
        if r is not None:
            if "".join(buf).strip() != r.text.strip():
                print(f"{C['y']}{name} ›{C['0']} {r.text}")
            for f in r.files:
                print(f"{C['g']}  📎 {f}{C['0']}")
        print()
        time.sleep(0.05)
    zeus.bus.unsubscribe(q)
