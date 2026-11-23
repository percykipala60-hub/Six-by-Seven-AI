#!/usr/bin/env python3
"""Faux serveur MCP (stdio) pour les tests : un outil « echo » et un outil « meteo »."""

import json
import sys


def reply(mid, result=None, error=None):
    msg = {"jsonrpc": "2.0", "id": mid}
    if error:
        msg["error"] = {"code": -32000, "message": error}
    else:
        msg["result"] = result
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    req = json.loads(line)
    mid, method, params = req.get("id"), req.get("method"), req.get("params") or {}
    if mid is None:
        continue
    if method == "initialize":
        reply(mid, {"protocolVersion": params.get("protocolVersion"), "capabilities": {"tools": {}},
                    "serverInfo": {"name": "faux-mcp", "version": "0.1"}})
    elif method == "tools/list":
        reply(mid, {"tools": [
            {"name": "echo", "description": "Renvoie le texte", "inputSchema": {"type": "object", "properties": {
                "texte": {"type": "string"}}, "required": ["texte"]}},
            {"name": "meteo", "description": "Météo d'une ville", "inputSchema": {"type": "object", "properties": {
                "ville": {"type": "string"}}}}]})
    elif method == "tools/call":
        name, args = params.get("name"), params.get("arguments") or {}
        if name == "echo":
            reply(mid, {"content": [{"type": "text", "text": "écho : " + args.get("texte", "")}]})
        elif name == "meteo":
            reply(mid, {"content": [{"type": "text", "text": f"{args.get('ville', 'Kinshasa')} : 31 °C, orageux"}]})
        else:
            reply(mid, {"content": [{"type": "text", "text": "outil inconnu"}], "isError": True})
    else:
        reply(mid, error=f"méthode inconnue {method}")
