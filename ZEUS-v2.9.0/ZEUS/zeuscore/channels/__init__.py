"""Canaux de communication de ZEUS."""

from __future__ import annotations

import html
import re
import threading
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:  # pragma: no cover
    from ..core import Zeus


class Channel:
    name = "base"

    def __init__(self, zeus: "Zeus"):
        self.zeus = zeus
        self._stop = threading.Event()
        self.last_error = ""
        self.connected = False
        self.stats = {"in": 0, "out": 0}

    @property
    def cfg(self):
        return self.zeus.config

    def start(self) -> None:  # pragma: no cover - surchargé
        self.connected = True

    def stop(self) -> None:
        self._stop.set()
        self.connected = False

    def send(self, peer: str, text: str, files: list[str] | None = None) -> None:  # pragma: no cover
        raise NotImplementedError

    def owner_peers(self) -> list[str]:
        return []

    def notify_owner(self, text: str, image: str | None = None, files: list[str] | None = None) -> bool:
        ok = False
        for peer in self.owner_peers():
            try:
                self.send(peer, text, ([image] if image else []) + (files or []))
                ok = True
            except Exception as e:  # noqa: BLE001
                self.last_error = str(e)
        return ok

    def send_approval(self, approval: dict, text: str) -> None:
        for peer in self.owner_peers():
            self.send(peer, text + f"\n\nRéponds « oui {approval['id']} » ou « non {approval['id']} ».", [])

    def status(self) -> dict[str, Any]:
        return {"connected": self.connected, "error": self.last_error, **self.stats}


def md_to_html(text: str) -> str:
    """Markdown simple → HTML Telegram (gras, italique, code, liens)."""
    blocks: list[str] = []

    def keep(m: re.Match) -> str:
        blocks.append(m.group(1))
        return f"\x00{len(blocks) - 1}\x00"

    t = re.sub(r"```(?:\w+)?\n?(.*?)```", keep, text, flags=re.S)
    t = html.escape(t, quote=False)
    t = re.sub(r"`([^`\n]+)`", r"<code>\1</code>", t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<i>\1</i>", t)
    t = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2">\1</a>', t)
    t = re.sub(r"^#{1,6}\s*(.+)$", r"<b>\1</b>", t, flags=re.M)
    t = re.sub(r"\x00(\d+)\x00", lambda m: f"<pre>{html.escape(blocks[int(m.group(1))])}</pre>", t)
    return t


def split_text(text: str, limit: int) -> list[str]:
    text = text or ""
    parts = []
    while len(text) > limit:
        cut = text.rfind("\n", 0, limit)
        if cut < limit * 0.5:
            cut = text.rfind(" ", 0, limit)
        if cut <= 0:
            cut = limit
        parts.append(text[:cut])
        text = text[cut:].lstrip()
    if text:
        parts.append(text)
    return parts or [""]
