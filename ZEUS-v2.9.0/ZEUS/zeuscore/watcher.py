"""Surveillance du téléphone : ZEUS lit régulièrement les notifications et réagit tout seul.

Déclencheurs (« si… alors… ») : appli, expéditeur, mots contenus → te prévenir, ou lancer une tâche.
Exemples : « préviens-moi si Maman m'écrit sur WhatsApp », « quand je reçois un SMS M-Pesa, ajoute
la transaction à mon budget ». Le canal SMS s'abonne aussi à cette surveillance.
"""

from __future__ import annotations

import hashlib
import threading
import time
from typing import TYPE_CHECKING, Callable

from .util import log, norm, truncate, wrap_untrusted

if TYPE_CHECKING:  # pragma: no cover
    from .core import Zeus

SMS_APPS = ("com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.mms",
            "com.android.messaging", "com.miui.smsextra", "com.oneplus.mms", "com.transsion.messaging")
APP_ALIASES = {
    "sms": SMS_APPS, "messages": SMS_APPS, "texto": SMS_APPS,
    "whatsapp": ("com.whatsapp", "com.whatsapp.w4b"), "telegram": ("org.telegram.messenger",),
    "gmail": ("com.google.android.gm",), "mail": ("com.google.android.gm", "com.microsoft.office.outlook"),
    "appel": ("com.google.android.dialer", "com.samsung.android.dialer", "com.android.server.telecom"),
    "telephone": ("com.google.android.dialer", "com.samsung.android.dialer", "com.android.server.telecom"),
    "facebook": ("com.facebook.katana", "com.facebook.orca"), "messenger": ("com.facebook.orca",),
    "mpesa": ("mpesa",), "m-pesa": ("mpesa",), "orange money": ("orange",), "airtel": ("airtel",),
}


def notif_key(n: dict) -> str:
    raw = f"{n.get('app')}|{n.get('title')}|{n.get('text')}"
    return hashlib.sha1(raw.encode("utf-8", "replace")).hexdigest()[:16]


def app_label(pkg: str) -> str:
    from .tools.phone import PKG_LABELS
    return PKG_LABELS.get(pkg, pkg)


def _alts(s: str) -> list[str]:
    return [norm(x) for x in (s or "").replace(",", "|").split("|") if x.strip()]


def matches(t: dict, n: dict) -> bool:
    pkg = (n.get("app") or "").lower()
    hay_app = norm(pkg + " " + app_label(pkg))
    apps = _alts(t.get("app", ""))
    if apps:
        ok = False
        for a in apps:
            al = APP_ALIASES.get(a)
            if (al and any(x in pkg for x in al)) or a in hay_app:
                ok = True
                break
        if not ok:
            return False
    senders = _alts(t.get("sender", ""))
    if senders and not any(s in norm(n.get("title") or "") for s in senders):
        return False
    words = _alts(t.get("contains", ""))
    if words and not any(w in norm(f"{n.get('title')} {n.get('text')}") for w in words):
        return False
    return bool(apps or senders or words)


class PhoneWatcher:
    def __init__(self, zeus: "Zeus"):
        self.zeus = zeus
        self.seen: dict[str, float] = {}
        self.baseline = False
        self.listeners: list[Callable[[list[dict]], None]] = []
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.last_poll = 0.0
        self.last_error = ""
        self.polls = 0

    # ------------------------------------------------------------------ cycle
    def subscribe(self, fn: Callable[[list[dict]], None]) -> None:
        if fn not in self.listeners:
            self.listeners.append(fn)

    def unsubscribe(self, fn: Callable[[list[dict]], None]) -> None:
        if fn in self.listeners:
            self.listeners.remove(fn)

    def needed(self) -> bool:
        return bool(self.listeners) or bool(self.zeus.db.list_triggers(enabled_only=True))

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True, name="surveillance-telephone")
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _loop(self) -> None:
        while not self._stop.wait(max(5, int(self.zeus.config.get("phone.watch_seconds") or 20))):
            if not self.needed():
                continue
            ph = self.zeus.phone
            try:
                if not (ph.connected() or ph.termux_api()):
                    continue
                self.poll()
                self.last_error = ""
            except Exception as e:  # noqa: BLE001
                self.last_error = str(e)
                log.debug("surveillance du téléphone : %s", e)

    # ------------------------------------------------------------------ lecture
    def poll(self, now: float | None = None) -> list[dict]:
        """Lit les notifications ; renvoie les nouvelles (rien au tout premier passage : état de départ)."""
        now = now or time.time()
        notifs = self.zeus.phone.notifications(60)
        self.last_poll = now
        self.polls += 1
        fresh = []
        for n in notifs:
            k = notif_key(n)
            if k not in self.seen:
                self.seen[k] = now
                fresh.append(n)
        if len(self.seen) > 3000:
            cutoff = now - 86400
            self.seen = {k: v for k, v in self.seen.items() if v > cutoff}
        if not self.baseline:
            self.baseline = True
            return []
        if fresh:
            self.zeus.bus.publish("phone_notifications", count=len(fresh))
            self.dispatch(fresh)
            for fn in list(self.listeners):
                try:
                    fn(fresh)
                except Exception:  # noqa: BLE001
                    log.exception("abonné de la surveillance")
        return fresh

    def dispatch(self, notifs: list[dict]) -> list[int]:
        fired = []
        triggers = self.zeus.db.list_triggers(enabled_only=True)
        for n in notifs:
            for t in triggers:
                if (t.get("source") or "notification") != "notification" or not matches(t, n):
                    continue
                last = t.get("last_fired") or 0
                if time.time() - last < int(t.get("cooldown") or 0):
                    continue
                t["last_fired"] = time.time()
                self.fire(t, n)
                fired.append(t["id"])
        return fired

    # ------------------------------------------------------------------ action
    def fire(self, t: dict, n: dict) -> None:
        z = self.zeus
        label = app_label(n.get("app") or "")
        event = f"{label} — {n.get('title') or ''} : {n.get('text') or ''}"
        z.db.update_trigger(t["id"], last_fired=time.time(), fires=(t.get("fires") or 0) + 1,
                            last_event=truncate(event, 300))
        z.db.audit("zeus", "déclencheur", {"id": t["id"], "name": t["name"], "event": truncate(event, 300)})
        z.bus.publish("trigger_fired", id=t["id"], name=t["name"], event=truncate(event, 300),
                      action=t.get("action") or "notify")
        if (t.get("action") or "notify") == "notify":
            z.notify_owner(f"🔔 {t['name']} — {truncate(event, 600)}")
            return

        def work() -> None:
            sess = z.db.find_session("scheduler", f"trigger-{t['id']}")
            sid = sess["id"] if sess else z.db.create_session("scheduler", f"trigger-{t['id']}", "system",
                                                              title=f"🔔 {t['name']}")
            prompt = (f"{t.get('prompt') or 'Traite cet événement.'}\n\n[Événement déclencheur — notification du téléphone]\n"
                      + wrap_untrusted(f"notification:{label}", event))
            res = z.agent.run(sid, prompt, profile="system", task_name=t["name"])
            z.deliver(t.get("deliver") or "owner", f"🔔 {t['name']}\n\n{res.text}", res.files)
        threading.Thread(target=work, daemon=True, name=f"declencheur-{t['id']}").start()

    def status(self) -> dict:
        return {"active": bool(self._thread and self._thread.is_alive()), "needed": self.needed(),
                "last_poll": self.last_poll, "polls": self.polls, "error": self.last_error,
                "listeners": len(self.listeners)}
