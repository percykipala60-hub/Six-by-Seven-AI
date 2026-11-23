"""Bus d'événements en mémoire : alimente l'interface web en direct (SSE)."""

from __future__ import annotations

import queue
import threading
import time
from typing import Any


class EventBus:
    def __init__(self, history: int = 300):
        self._subs: list[queue.Queue] = []
        self._lock = threading.Lock()
        self._history: list[dict] = []
        self._max = history
        self._seq = 0

    def subscribe(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=2000)
        with self._lock:
            self._subs.append(q)
        return q

    def unsubscribe(self, q: queue.Queue) -> None:
        with self._lock:
            if q in self._subs:
                self._subs.remove(q)

    def publish(self, type_: str, **data: Any) -> dict:
        with self._lock:
            self._seq += 1
            ev = {"type": type_, "ts": time.time(), "seq": self._seq, **data}
            if type_ != "assistant_delta":
                self._history.append(ev)
                if len(self._history) > self._max:
                    self._history = self._history[-self._max:]
            subs = list(self._subs)
        for q in subs:
            try:
                q.put_nowait(ev)
            except queue.Full:
                pass
        return ev

    def recent(self, since_seq: int = 0) -> list[dict]:
        with self._lock:
            return [e for e in self._history if e["seq"] > since_seq]

    @property
    def subscribers(self) -> int:
        with self._lock:
            return len(self._subs)
