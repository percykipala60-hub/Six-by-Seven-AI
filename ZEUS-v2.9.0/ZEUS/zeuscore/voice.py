"""Voix : transcription (Whisper via une API compatible OpenAI — locale ou cloud) et synthèse vocale.

Multilingue : la transcription détecte la langue toute seule (français, anglais, espagnol, allemand…) et la
synthèse choisit une voix de la langue du texte."""

from __future__ import annotations

import json
import re
import time
import urllib.request
import uuid
from pathlib import Path
from typing import Any

from .util import guess_mime, log, run_cmd, which, IS_MAC, IS_WINDOWS


def multipart(fields: dict[str, str], files: dict[str, tuple[str, bytes, str]]) -> tuple[bytes, str]:
    """Encode un formulaire multipart/form-data (sans dépendance)."""
    boundary = "----zeus" + uuid.uuid4().hex
    out = bytearray()
    for k, v in fields.items():
        out += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
    for k, (fname, data, mime) in files.items():
        out += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"; filename=\"{fname}\"\r\n"
                f"Content-Type: {mime}\r\n\r\n").encode()
        out += data + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return bytes(out), f"multipart/form-data; boundary={boundary}"


def _stt_endpoint(config: Any) -> tuple[str, str, str] | None:
    from .config import Config
    stt = config.get("voice.stt") or {}
    if stt.get("base_url"):
        return stt["base_url"].rstrip("/"), Config.secret(stt.get("api_key", "")), stt.get("model") or "whisper-1"
    # Réutilise automatiquement une clé Groq ou OpenAI déjà configurée pour un modèle.
    for m in config.get("models") or []:
        base = (m.get("base_url") or "").rstrip("/")
        key = Config.secret(m.get("api_key", ""))
        if not key:
            continue
        if "groq.com" in base or m.get("provider") == "groq":
            return base or "https://api.groq.com/openai/v1", key, "whisper-large-v3-turbo"
        if "api.openai.com" in base or (m.get("provider") == "openai" and not base):
            return base or "https://api.openai.com/v1", key, "whisper-1"
    # Clés posées dans .env / l'environnement
    import os
    if os.environ.get("GROQ_API_KEY"):
        return "https://api.groq.com/openai/v1", os.environ["GROQ_API_KEY"], "whisper-large-v3-turbo"
    if os.environ.get("OPENAI_API_KEY"):
        return "https://api.openai.com/v1", os.environ["OPENAI_API_KEY"], "whisper-1"
    return None


def stt_available(config: Any) -> bool:
    return _stt_endpoint(config) is not None


def transcribe(config: Any, path: str, language: str | None = None) -> str | None:
    """Audio → texte. language vide = détection automatique de la langue parlée (réglage voice.language sinon)."""
    ep = _stt_endpoint(config)
    if not ep:
        return None
    base, key, model = ep
    p = Path(path)
    fields = {"model": model, "response_format": "json"}
    lang = language if language is not None else (config.get("voice.language") or "")
    if lang:
        fields["language"] = lang[:2]
    body, ctype = multipart(fields,
                            {"file": (p.name, p.read_bytes(), guess_mime(str(p)))})
    headers = {"Content-Type": ctype}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    req = urllib.request.Request(f"{base}/audio/transcriptions", data=body, headers=headers, method="POST")
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=180) as r:
        raw = r.read().decode("utf-8", "replace")
    try:
        text = json.loads(raw).get("text", "")
    except Exception:
        text = raw
    log.info("transcription %s en %.1fs", p.name, time.time() - t0)
    return text.strip() or None


_EMOJI = re.compile("[\U0001F000-\U0001FAFF\u2600-\u27BF\uFE0F\u200d]")
MAC_VOICES = {"fr": "Thomas", "en": "Samantha", "es": "Monica", "de": "Anna"}


def speech_text(text: str) -> str:
    """Texte prêt à être lu : sans markdown, liens, blocs de code ni emoji."""
    t = re.sub(r"```.*?```", " (voir le code à l'écran) ", text or "", flags=re.S)
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", t)
    t = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", t)
    t = re.sub(r"https?://\S+", "", t)
    t = re.sub(r"[*_`#>|]+", " ", t)
    t = _EMOJI.sub("", t)
    return re.sub(r"[ \t]+", " ", t).strip()


def speak(config: Any, text: str, dest_dir: Path, lang: str = "") -> Path | None:
    """Synthèse vocale : API compatible OpenAI si configurée, sinon voix du système dans la langue du texte."""
    from .config import Config
    from .modes import detect_lang
    tts = config.get("voice.tts") or {}
    dest_dir.mkdir(parents=True, exist_ok=True)
    text = speech_text(text)
    if not text:
        return None
    lang = (lang or detect_lang(text, config.get("assistant.language") or "fr"))[:2]
    if tts.get("base_url"):
        payload = {"model": tts.get("model") or "tts-1", "voice": tts.get("voice") or "alloy", "input": text[:4000]}
        headers = {"Content-Type": "application/json"}
        key = Config.secret(tts.get("api_key", ""))
        if key:
            headers["Authorization"] = f"Bearer {key}"
        req = urllib.request.Request(tts["base_url"].rstrip("/") + "/audio/speech", data=json.dumps(payload).encode(),
                                     headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                f = dest_dir / f"voix_{int(time.time() * 1000)}.mp3"
                f.write_bytes(r.read())
                return f
        except Exception as e:  # noqa: BLE001
            log.warning("synthèse vocale : %s", e)
    f = dest_dir / f"voix_{int(time.time() * 1000)}"
    if IS_MAC and which("say"):
        out = f.with_suffix(".aiff")
        for voice in (["-v", MAC_VOICES[lang]] if lang in MAC_VOICES else [], []):
            if run_cmd(["say", *voice, "-o", str(out), text[:3000]], timeout=120)[0] == 0:
                return out
    elif IS_WINDOWS:
        out = f.with_suffix(".wav")
        safe = text[:3000].replace("'", "''")
        script = ("Add-Type -AssemblyName System.Speech;$s=New-Object System.Speech.Synthesis.SpeechSynthesizer;"
                  f"$v=$s.GetInstalledVoices()|Where-Object {{$_.Enabled -and $_.VoiceInfo.Culture.Name -like '{lang}*'}}"
                  "|Select-Object -First 1;if($v){$s.SelectVoice($v.VoiceInfo.Name)};"
                  f"$s.SetOutputToWaveFile('{out}');$s.Speak('{safe}');$s.Dispose()")
        if run_cmd(["powershell", "-NoProfile", "-Command", script], timeout=120)[0] == 0 and out.exists():
            return out
    else:
        for exe in ("espeak-ng", "espeak"):
            if which(exe):
                out = f.with_suffix(".wav")
                if run_cmd([exe, "-v", lang or "fr", "-w", str(out), text[:3000]], timeout=120)[0] == 0:
                    return out
    return None
