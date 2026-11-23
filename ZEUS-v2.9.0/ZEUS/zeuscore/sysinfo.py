"""Relevés de la machine (processeur, mémoire, disque) sans aucune dépendance, pour l'interface spatiale.

Windows : fonctions du noyau (GetSystemTimes, GlobalMemoryStatusEx) via ctypes ; Linux, Android (Termux), Raspberry Pi :
/proc/stat et /proc/meminfo. Ailleurs (Mac), les valeurs inconnues restent vides : l'interface affiche « — ».
"""

from __future__ import annotations

import os
import shutil
import sys
import threading
import time
from pathlib import Path
from typing import Any


def _cpu_times() -> tuple[int, int] | None:
    """(occupé, total) cumulés depuis le démarrage de la machine, ou None."""
    if sys.platform == "win32":
        import ctypes
        from ctypes import wintypes

        idle, kernel, user = wintypes.FILETIME(), wintypes.FILETIME(), wintypes.FILETIME()
        if not ctypes.windll.kernel32.GetSystemTimes(ctypes.byref(idle), ctypes.byref(kernel), ctypes.byref(user)):
            return None
        val = lambda ft: (ft.dwHighDateTime << 32) | ft.dwLowDateTime  # noqa: E731
        i, k, u = val(idle), val(kernel), val(user)
        return (k - i) + u, k + u  # le temps « noyau » contient déjà le temps d'inactivité
    try:
        with open("/proc/stat", encoding="ascii") as f:
            parts = [int(x) for x in f.readline().split()[1:]]
    except (OSError, ValueError):
        return None
    if len(parts) < 4:
        return None
    idle = parts[3] + (parts[4] if len(parts) > 4 else 0)
    total = sum(parts[:8])
    return total - idle, total


def memory() -> dict[str, Any] | None:
    if sys.platform == "win32":
        import ctypes

        class MEMORYSTATUSEX(ctypes.Structure):
            _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                        ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                        ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                        ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                        ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]
        st = MEMORYSTATUSEX()
        st.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
        if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(st)):
            return None
        total, avail = st.ullTotalPhys, st.ullAvailPhys
    else:
        try:
            info = {}
            with open("/proc/meminfo", encoding="ascii") as f:
                for line in f:
                    k, _, v = line.partition(":")
                    info[k] = int(v.split()[0]) * 1024
            total, avail = info["MemTotal"], info.get("MemAvailable", info.get("MemFree", 0))
        except (OSError, KeyError, ValueError, IndexError):
            return None
    if not total:
        return None
    used = total - avail
    return {"percent": round(used * 100 / total, 1), "used_gb": round(used / 2**30, 1), "total_gb": round(total / 2**30, 1)}


def disk(path: str | Path) -> dict[str, Any] | None:
    try:
        u = shutil.disk_usage(str(path))
    except OSError:
        return None
    return {"percent": round(u.used * 100 / u.total, 1) if u.total else None, "free_gb": round(u.free / 2**30, 1),
            "total_gb": round(u.total / 2**30, 1)}


class SysStats:
    """Mesure du processeur entre deux relevés (la première valeur couvre la période depuis le lancement de ZEUS)."""

    def __init__(self, home: str | Path = "."):
        self.home = Path(home)
        self._lock = threading.Lock()
        self._prev = _cpu_times()
        self._last: tuple[float, float | None] = (0.0, None)

    def cpu(self) -> float | None:
        with self._lock:
            now = _cpu_times()
            if now is None or self._prev is None:
                return None
            busy, total = now[0] - self._prev[0], now[1] - self._prev[1]
            if total <= 0:
                return self._last[1]  # appels trop rapprochés : on garde la dernière valeur
            self._prev = now
            value = round(max(0.0, min(100.0, busy * 100 / total)), 1)
            self._last = (time.time(), value)
            return value

    def snapshot(self) -> dict[str, Any]:
        return {"cpu": self.cpu(), "cores": os.cpu_count(), "memory": memory(), "disk": disk(self.home),
                "ts": time.time()}


__all__ = ["SysStats", "memory", "disk"]
