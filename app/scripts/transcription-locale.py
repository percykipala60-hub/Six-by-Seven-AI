"""Serveur vocal local. Lancer avec le Python contenant faster-whisper."""
import io
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from faster_whisper import WhisperModel

model = WhisperModel('base', device='cpu', compute_type='int8')


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
        if self.path != '/transcribe' or self.headers.get('Origin'):
            self.repondre(403, {'error': 'Requête refusée.'})
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 10 * 1024 * 1024:
                self.repondre(413, {'error': 'Audio trop volumineux ou vide.'})
                return
            self.connection.settimeout(30)
            audio = self.rfile.read(size)
            segments, _info = model.transcribe(io.BytesIO(audio), language='fr', vad_filter=True)
            self.repondre(200, {'texte': ' '.join(s.text.strip() for s in segments).strip()})
        except Exception:
            self.repondre(422, {'error': 'Audio illisible.'})


print('Transcription locale prête sur 127.0.0.1:8765', flush=True)
HTTPServer(('127.0.0.1', 8765), Transcription).serve_forever()
