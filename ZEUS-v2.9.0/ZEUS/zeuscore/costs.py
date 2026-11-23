"""Compteur de dépenses des modèles payants et plafond mensuel.

Chaque appel à un modèle est enregistré (jetons d'entrée, de sortie, lus ou écrits dans le cache) avec son
coût estimé. Tarifs officiels Claude intégrés ; pour un autre fournisseur payant, indique « price_in » et
« price_out » (en $ par million de jetons) dans le modèle (Réglages → Modèles).

Plafond mensuel (budget.monthly_usd) : à 80 % ZEUS te prévient ; à 100 % il passe sur tes modèles gratuits
(locaux) ou s'arrête, selon budget.on_limit.
"""

from __future__ import annotations

import threading
import time
from typing import TYPE_CHECKING, Any

from .util import log

if TYPE_CHECKING:  # pragma: no cover
    from .core import Zeus
    from .llm import ModelHandle

# $ par million de jetons : (entrée, sortie, lecture du cache). Écriture dans le cache = entrée × 1,25 (5 min)
# ou × 2 (1 h). Source : platform.claude.com/docs/en/about-claude/pricing (octobre 2026).
CLAUDE_PRICES: dict[str, tuple[float, float, float]] = {
    "claude-fable-5-1": (10.0, 50.0, 0.25),
    "claude-mythos-5-1": (10.0, 50.0, 0.25),
    "claude-fable-5": (10.0, 50.0, 1.0),
    "claude-mythos-5": (10.0, 50.0, 1.0),
    "claude-opus-5-5": (4.0, 20.0, 0.20),
    "claude-opus-5": (5.0, 25.0, 0.50),
    "claude-opus-4-8": (5.0, 25.0, 0.50),
    "claude-opus-4-7": (5.0, 25.0, 0.50),
    "claude-opus-4-6": (5.0, 25.0, 0.50),
    "claude-opus-4-5": (5.0, 25.0, 0.50),
    "claude-opus-4-1": (15.0, 75.0, 1.50),
    "claude-opus-4": (15.0, 75.0, 1.50),
    "claude-sonnet-5-5": (2.0, 10.0, 0.10),
    "claude-sonnet-5": (2.0, 10.0, 0.20),
    "claude-sonnet-4-6": (3.0, 15.0, 0.30),
    "claude-sonnet-4-5": (3.0, 15.0, 0.30),
    "claude-sonnet-4": (3.0, 15.0, 0.30),
    "claude-haiku-5-5": (0.10, 0.50, 0.01),     # prompts jusqu'à 100 000 jetons
    "claude-haiku-4-5": (1.0, 5.0, 0.10),
    "claude-3-5-haiku": (0.80, 4.0, 0.08),
}
HAIKU_55_LONG = (0.50, 2.50, 0.05)              # Haiku 5.5, prompts de plus de 100 000 jetons
LOCAL_PROVIDERS = ("ollama", "lmstudio", "llamacpp", "vllm")
LOCAL_HOSTS = ("localhost", "127.0.0.1", "0.0.0.0", "::1", "192.168.", "10.", "172.16.")


def claude_price(model: str) -> tuple[float, float, float] | None:
    m = (model or "").lower().replace(".", "-")
    for key in sorted(CLAUDE_PRICES, key=len, reverse=True):
        if m == key or m.startswith(key + "-") or m.startswith(key + "@") or m.endswith("/" + key) or \
                ("/" + key + "-") in m or m.startswith("anthropic/" + key):
            return CLAUDE_PRICES[key]
    return None


def is_local(cfg: dict) -> bool:
    if (cfg.get("provider") or "") in LOCAL_PROVIDERS:
        return True
    url = (cfg.get("base_url") or "").lower()
    host = url.split("://", 1)[-1].split("/", 1)[0]
    return any(host.startswith(h) for h in LOCAL_HOSTS)


def model_prices(cfg: dict) -> tuple[float, float, float] | None:
    """Prix du modèle ($/M jetons), 0 pour un modèle local, None si inconnu (modèle payant non renseigné)."""
    if cfg.get("price_in") not in (None, "") or cfg.get("price_out") not in (None, ""):
        pin = float(cfg.get("price_in") or 0)
        return pin, float(cfg.get("price_out") or 0), float(cfg.get("price_cache_read") or pin * 0.1)
    known = claude_price(cfg.get("model") or "")
    if known and (cfg.get("provider") or "") not in LOCAL_PROVIDERS:
        return known  # même derrière une passerelle locale, un modèle Claude reste payant
    if is_local(cfg):
        return 0.0, 0.0, 0.0
    from .llm import is_free_tier
    if known is None and is_free_tier(cfg):
        return 0.0, 0.0, 0.0  # offre gratuite (Groq) : rien à payer ; « tier »: « paid » si tu passes à l'offre payante
    return known


def usage_tokens(usage: dict) -> dict[str, int]:
    """Normalise les compteurs de jetons des différents fournisseurs."""
    u = usage or {}
    cache_read = int(u.get("cache_read_input_tokens") or 0)
    cache_write = int(u.get("cache_creation_input_tokens") or 0)
    if "input_tokens" in u or "output_tokens" in u:          # Anthropic : input_tokens exclut le cache
        tin, tout = int(u.get("input_tokens") or 0), int(u.get("output_tokens") or 0)
    else:                                                     # OpenAI / Ollama : prompt_tokens inclut le cache
        tin, tout = int(u.get("prompt_tokens") or 0), int(u.get("completion_tokens") or 0)
        details = u.get("prompt_tokens_details") or {}
        cache_read = int(details.get("cached_tokens") or u.get("prompt_cache_hit_tokens") or 0)
        tin = max(0, tin - cache_read)
    return {"in": tin, "out": tout, "cache_read": cache_read, "cache_write": cache_write}


def estimate_cost(cfg: dict, usage: dict) -> float | None:
    tok = usage_tokens(usage)
    prices = model_prices(cfg)
    if prices is None:
        return None
    pin, pout, pread = prices
    if claude_price(cfg.get("model") or "") == CLAUDE_PRICES["claude-haiku-5-5"] and \
            cfg.get("price_in") in (None, "") and tok["in"] + tok["cache_read"] + tok["cache_write"] > 100_000:
        pin, pout, pread = HAIKU_55_LONG
    write_mult = 2.0 if cfg.get("cache_ttl") == "1h" else 1.25
    return (tok["in"] * pin + tok["cache_write"] * pin * write_mult + tok["cache_read"] * pread +
            tok["out"] * pout) / 1_000_000


def month_key(ts: float | None = None) -> str:
    return time.strftime("%Y-%m", time.localtime(ts or time.time()))


def day_key(ts: float | None = None) -> str:
    return time.strftime("%Y-%m-%d", time.localtime(ts or time.time()))


class CostTracker:
    def __init__(self, zeus: "Zeus"):
        self.zeus = zeus
        self._lock = threading.Lock()
        self._month_cache: tuple[str, float, float] = ("", 0.0, 0.0)  # (mois, total, horodatage)

    # ------------------------------------------------------------------ plafond
    @property
    def limit(self) -> float:
        try:
            return max(0.0, float(self.zeus.config.get("budget.monthly_usd") or 0))
        except (TypeError, ValueError):
            return 0.0

    def month_total(self, fresh: bool = False) -> float:
        mk = month_key()
        m, total, ts = self._month_cache
        if not fresh and m == mk and time.time() - ts < 30:
            return total
        total = self.zeus.db.usage_total(mk)
        self._month_cache = (mk, total, time.time())
        return total

    def exhausted(self) -> bool:
        return self.limit > 0 and self.month_total() >= self.limit

    def allow(self, handle: "ModelHandle") -> bool:
        """Faux si le plafond du mois est atteint et que ce modèle est payant (ou de prix inconnu)."""
        if not self.exhausted():
            return True
        self._check_threshold()  # prévient une seule fois par mois, même si le plafond a été baissé entre-temps
        prices = model_prices(handle.cfg)
        return prices is not None and prices[0] == 0 and prices[1] == 0

    def blocked_message(self) -> str:
        return (f"Plafond de dépenses du mois atteint ({self.month_total():.2f} $ sur {self.limit:.2f} $). "
                f"Augmente-le dans Réglages → Modèles → Dépenses, ou ajoute un modèle local gratuit (Ollama).")

    # ------------------------------------------------------------------ enregistrement
    def record(self, handle: "ModelHandle", usage: dict, purpose: str = "") -> float | None:
        if not usage:
            return None
        tok = usage_tokens(usage)
        if not any(tok.values()):
            return None
        cost = estimate_cost(handle.cfg, usage)
        try:
            self.zeus.db.add_usage(handle.id, handle.cfg.get("model") or "", purpose, tok["in"], tok["out"],
                                   tok["cache_read"], tok["cache_write"], cost)
        except Exception as e:  # noqa: BLE001
            log.warning("compteur de dépenses : %s", e)
            return cost
        if cost:
            with self._lock:
                m, total, ts = self._month_cache
                if m == month_key():
                    self._month_cache = (m, total + cost, ts)
            self._check_threshold()
        return cost

    def _check_threshold(self) -> None:
        lim = self.limit
        if lim <= 0:
            return
        total = self.month_total()
        warn = float(self.zeus.config.get("budget.warn_percent") or 80) / 100
        mk = month_key()
        for level, flag in ((1.0, "full"), (warn, "warn")):
            if total >= lim * level:
                key = f"budget_{flag}_{mk}"
                if self.zeus.db.kv_get(key):
                    return
                self.zeus.db.kv_set(key, "1")
                if flag == "full":
                    action = ("ZEUS passe sur tes modèles gratuits" if self.zeus.config.get("budget.on_limit") != "stop"
                              else "ZEUS met en pause les modèles payants")
                    self.zeus.notify_owner(f"💸 Plafond du mois atteint : {total:.2f} $ sur {lim:.2f} $. {action} "
                                           f"jusqu'au mois prochain (modifiable dans Réglages → Modèles).")
                else:
                    self.zeus.notify_owner(f"💸 Dépenses du mois : {total:.2f} $, soit {total / lim:.0%} du plafond "
                                           f"de {lim:.2f} $.")
                return

    # ------------------------------------------------------------------ état
    def status(self) -> dict[str, Any]:
        db = self.zeus.db
        mk, dk = month_key(), day_key()
        month = self.month_total(fresh=True)
        unknown = []
        for m in self.zeus.config.get("models") or []:
            if m.get("model") and m.get("enabled") is not False and model_prices(m) is None:
                unknown.append(m.get("id") or m.get("model"))
        return {"month": round(month, 4), "today": round(db.usage_total(mk, dk), 4), "limit": self.limit,
                "on_limit": self.zeus.config.get("budget.on_limit") or "local", "exhausted": self.exhausted(),
                "by_model": db.usage_by_model(mk), "days": db.usage_by_day(31), "unknown_prices": unknown}


__all__ = ["CostTracker", "estimate_cost", "model_prices", "usage_tokens", "claude_price", "CLAUDE_PRICES"]
