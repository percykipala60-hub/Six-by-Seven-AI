"""Certificat HTTPS autosigné, en Python pur (ni OpenSSL ni bibliothèque à installer).

Sur le Wi-Fi, le navigateur d'un téléphone n'ouvre le micro que sur une page HTTPS : avec ce certificat, le mode
Jarvis, la dictée et les exercices de prononciation marchent aussi sur le téléphone. Il est autosigné : le navigateur
affiche un avertissement la première fois (« Paramètres avancés → Continuer »), puis tout fonctionne.
"""

from __future__ import annotations

import base64
import datetime as _dt
import hashlib
import ipaddress
import secrets
from pathlib import Path

_SMALL_PRIMES = [p for p in range(3, 2000, 2) if all(p % d for d in range(3, int(p ** 0.5) + 1, 2))]


def _probable_prime(n: int, rounds: int = 40) -> bool:
    if n < 2:
        return False
    for p in _SMALL_PRIMES:
        if n % p == 0:
            return n == p
    d, r = n - 1, 0
    while d % 2 == 0:
        d //= 2
        r += 1
    for _ in range(rounds):
        x = pow(secrets.randbelow(n - 3) + 2, d, n)
        if x in (1, n - 1):
            continue
        for _ in range(r - 1):
            x = pow(x, 2, n)
            if x == n - 1:
                break
        else:
            return False
    return True


def _prime(bits: int) -> int:
    while True:
        c = secrets.randbits(bits) | (1 << (bits - 1)) | (1 << (bits - 2)) | 1  # 2 bits de poids fort : n fait bien 2×bits
        if _probable_prime(c):
            return c


def rsa_key(bits: int = 2048) -> dict:
    e = 65537
    while True:
        p, q = _prime(bits // 2), _prime(bits // 2)
        phi = (p - 1) * (q - 1)
        if p != q and phi % e:
            break
    d = pow(e, -1, phi)
    return {"n": p * q, "e": e, "d": d, "p": p, "q": q}


# --------------------------------------------------------------------------- DER (ASN.1)
def _len(n: int) -> bytes:
    if n < 0x80:
        return bytes([n])
    b = n.to_bytes((n.bit_length() + 7) // 8, "big")
    return bytes([0x80 | len(b)]) + b


def _tlv(tag: int, content: bytes) -> bytes:
    return bytes([tag]) + _len(len(content)) + content


def _int(v: int) -> bytes:
    return _tlv(0x02, v.to_bytes(v.bit_length() // 8 + 1, "big"))


def _seq(*items: bytes) -> bytes:
    return _tlv(0x30, b"".join(items))


def _oid(dotted: str) -> bytes:
    parts = [int(x) for x in dotted.split(".")]
    body = bytearray([40 * parts[0] + parts[1]])
    for v in parts[2:]:
        chunk = [v & 0x7F]
        v >>= 7
        while v:
            chunk.append(0x80 | (v & 0x7F))
            v >>= 7
        body += bytes(reversed(chunk))
    return _tlv(0x06, bytes(body))


def _time(t: _dt.datetime) -> bytes:
    return _tlv(0x17, t.strftime("%y%m%d%H%M%SZ").encode()) if t.year < 2050 else _tlv(0x18, t.strftime("%Y%m%d%H%M%SZ").encode())


NULL = b"\x05\x00"
SHA256_RSA = _seq(_oid("1.2.840.113549.1.1.11"), NULL)


def _name(cn: str) -> bytes:
    return _seq(_tlv(0x31, _seq(_oid("2.5.4.3"), _tlv(0x0C, cn.encode()))))


def _sign(key: dict, data: bytes) -> bytes:
    """Signature RSA PKCS#1 v1.5 avec SHA-256."""
    k = (key["n"].bit_length() + 7) // 8
    digest_info = _seq(_seq(_oid("2.16.840.1.101.3.4.2.1"), NULL), _tlv(0x04, hashlib.sha256(data).digest()))
    em = b"\x00\x01" + b"\xff" * (k - len(digest_info) - 3) + b"\x00" + digest_info
    return pow(int.from_bytes(em, "big"), key["d"], key["n"]).to_bytes(k, "big")


def make_certificate(key: dict, hosts: list[str], ips: list[str], days: int = 825, cn: str = "ZEUS") -> bytes:
    now = _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0)
    san = b"".join(_tlv(0x82, h.encode()) for h in dict.fromkeys(hosts) if h) + \
        b"".join(_tlv(0x87, ipaddress.ip_address(i).packed) for i in dict.fromkeys(ips) if i)
    extensions = _seq(
        _seq(_oid("2.5.29.17"), _tlv(0x04, _seq(san))),                                   # noms et adresses
        _seq(_oid("2.5.29.19"), _tlv(0x01, b"\xff"), _tlv(0x04, _seq())),                  # pas une autorité
        _seq(_oid("2.5.29.15"), _tlv(0x01, b"\xff"), _tlv(0x04, _tlv(0x03, b"\x05\xa0"))),  # signature + chiffrement
        _seq(_oid("2.5.29.37"), _tlv(0x04, _seq(_oid("1.3.6.1.5.5.7.3.1")))),              # serveur web
    )
    spki = _seq(_seq(_oid("1.2.840.113549.1.1.1"), NULL), _tlv(0x03, b"\x00" + _seq(_int(key["n"]), _int(key["e"]))))
    tbs = _seq(_tlv(0xA0, _int(2)), _int(secrets.randbits(63) | 1), SHA256_RSA, _name(cn),
               _seq(_time(now - _dt.timedelta(days=1)), _time(now + _dt.timedelta(days=days))), _name(cn), spki,
               _tlv(0xA3, extensions))
    return _seq(tbs, SHA256_RSA, _tlv(0x03, b"\x00" + _sign(key, tbs)))


def _pem(kind: str, der: bytes) -> str:
    b64 = base64.b64encode(der).decode()
    return f"-----BEGIN {kind}-----\n" + "\n".join(b64[i:i + 64] for i in range(0, len(b64), 64)) + f"\n-----END {kind}-----\n"


def private_key_pem(key: dict) -> str:
    n, e, d, p, q = key["n"], key["e"], key["d"], key["p"], key["q"]
    der = _seq(_int(0), _int(n), _int(e), _int(d), _int(p), _int(q), _int(d % (p - 1)), _int(d % (q - 1)), _int(pow(q, -1, p)))
    return _pem("RSA PRIVATE KEY", der)


def ensure_cert(folder: Path, hosts: list[str], ips: list[str]) -> tuple[Path, Path]:
    """Crée (ou recrée si l'adresse du PC a changé) le certificat de ZEUS ; renvoie (certificat, clé)."""
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    cert, keyf, stamp = folder / "zeus-cert.pem", folder / "zeus-key.pem", folder / "zeus-cert.hosts"
    want = ",".join(sorted(set(hosts) | set(ips)))
    if cert.exists() and keyf.exists() and stamp.exists() and stamp.read_text(encoding="utf-8") == want:
        return cert, keyf
    key = rsa_key(2048)
    keyf.write_text(private_key_pem(key), encoding="utf-8")
    try:
        keyf.chmod(0o600)
    except OSError:
        pass
    cert.write_text(_pem("CERTIFICATE", make_certificate(key, hosts, ips)), encoding="utf-8")
    stamp.write_text(want, encoding="utf-8")
    return cert, keyf
