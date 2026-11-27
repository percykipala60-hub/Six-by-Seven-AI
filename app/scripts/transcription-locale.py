"""Serveur vocal local. Lancer avec le Python contenant faster-whisper."""
import io
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse
from faster_whisper import WhisperModel

# Modèle Whisper (licence MIT) : « base » par défaut ; « small » comprend mieux mais pèse ~460 Mo de plus.
model = WhisperModel(os.environ.get('SIX_WHISPER_MODELE', 'base'), device='cpu', compute_type='int8')
LANGUES = {'fr', 'en', 'es', 'de', 'zh', 'ln', 'sw'}


class Transcription(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def repondre(self, status, data):
        payload = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        self.repondre(200 if self.path == '/health' else 404, {'ready': True})

    def do_POST(self):
        adresse = urlparse(self.path)
        if adresse.path != '/transcribe' or self.headers.get('Origin'):
            self.repondre(403, {'error': 'Requête refusée.'})
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 10 * 1024 * 1024:
                self.repondre(413, {'error': 'Audio trop volumineux ou vide.'})
                return
            self.connection.settimeout(30)
            audio = self.rfile.read(size)
            demandee = parse_qs(adresse.query).get('langue', ['fr'])[0]
            langue = demandee if demandee in LANGUES else None  # « auto » : Whisper reconnaît la langue
            segments, info = model.transcribe(
                io.BytesIO(audio),
                language=langue,
                vad_filter=True,
                beam_size=5,
                # Le nom de l'assistant, pour qu'il soit écrit « Six » et non « 6 ».
                initial_prompt="Six",
            )
            self.repondre(200, {'texte': ' '.join(s.text.strip() for s in segments).strip(),
                               'langue': info.language})
        except Exception:
            self.repondre(422, {'error': 'Audio illisible.'})


print('Transcription locale prête sur 127.0.0.1:8765', flush=True)
HTTPServer(('127.0.0.1', 8765), Transcription).serve_forever()
