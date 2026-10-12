"""Experimental independent Python client. Requires Python 3.10+ and cryptography.

Canonical profile permits safe integers, Unicode strings and JSON containers only.
Keys stay with the caller. No automatic payment, website scraping or private upload.
"""
import base64
import hashlib
import json
import time
import uuid
import urllib.request
import urllib.parse
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

VERSION = "oamp/0.1"


def canonical(value):
    if value is None or isinstance(value, bool):
        return json.dumps(value, separators=(",", ":"))
    if isinstance(value, int):
        if abs(value) > 9007199254740991:
            raise ValueError("UNSAFE_NUMBER")
        return str(value)
    if isinstance(value, str):
        value.encode("utf-8", errors="strict")
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(canonical(x) for x in value) + "]"
    if isinstance(value, dict) and all(isinstance(k, str) for k in value):
        keys = sorted(value, key=lambda k: k.encode("utf-16-be"))
        return "{" + ",".join(canonical(k) + ":" + canonical(value[k]) for k in keys) + "}"
    raise ValueError("INVALID_JSON")


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def new_key():
    private = Ed25519PrivateKey.generate()
    public = base64.b64encode(private.public_key().public_bytes(
        serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)).decode()
    return {"publicKey": public, "id": "oamp:" + digest(public), "privateKey": private}


def sign_event(key, kind, subject, payload, principal=None, delegation=None):
    body = {"version": VERSION, "kind": kind, "subject": subject,
            "principal": principal or key["id"], "actor": key["id"], "publicKey": key["publicKey"],
            "issuedAt": int(time.time() * 1000), "nonce": str(uuid.uuid4()), "payload": payload}
    if delegation:
        body["delegation"] = delegation
    event_id = digest(VERSION + ":event:" + canonical(body))
    return {**body, "id": event_id, "signature": base64.b64encode(key["privateKey"].sign(bytes.fromhex(event_id))).decode()}


def verify_event(event):
    allowed = {"version", "kind", "subject", "principal", "actor", "publicKey", "issuedAt", "nonce", "payload", "delegation", "id", "signature"}
    if set(event) - allowed or event["version"] != VERSION:
        raise ValueError("INVALID_EVENT")
    body = {k: v for k, v in event.items() if k not in ("id", "signature")}
    if digest(VERSION + ":event:" + canonical(body)) != event["id"]:
        raise ValueError("HASH_MISMATCH")
    if event["actor"] != "oamp:" + digest(event["publicKey"]):
        raise ValueError("ACTOR_KEY_MISMATCH")
    public = serialization.load_der_public_key(base64.b64decode(event["publicKey"]))
    public.verify(base64.b64decode(event["signature"]), bytes.fromhex(event["id"]))
    return event


def verify_record(record):
    body = {k: v for k, v in record.items() if k not in ("publicKey", "actor", "signature")}
    if record["actor"] != "oamp:" + digest(record["publicKey"]):
        raise ValueError("ACTOR_KEY_MISMATCH")
    public = serialization.load_der_public_key(base64.b64decode(record["publicKey"]))
    public.verify(base64.b64decode(record["signature"]), (VERSION + ":record:" + canonical(body)).encode())
    return record


class Client:
    def __init__(self, url):
        self.url = url.rstrip("/")

    def request(self, path, body=None):
        request = urllib.request.Request(self.url + path,
                  data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
                  headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.load(response)

    def publish(self, event):
        return self.request("/v1/events", event)

    def reputation(self, identity, view="legacy"):
        if view not in ("legacy", "evidence-v2"):
            raise ValueError("BAD_REPUTATION_VIEW")
        suffix = "" if view == "legacy" else "?view=" + view
        return self.request("/v1/reputation/" + urllib.parse.quote(identity, safe="") + suffix)

    def create_identity(self, key, name, roles):
        event = sign_event(key, "identity.create", key["id"], {"name": name, "roles": roles})
        self.publish(event)
        return event
