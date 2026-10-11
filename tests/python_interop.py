import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "clients" / "python"))
from oamp import Client, canonical, new_key, verify_event, verify_record

packet = json.load(sys.stdin)
verify_event(packet["event"])
verify_record(packet["record"])
verify_event(packet["fixture"]["event"])
verify_record(packet["fixture"]["record"])
assert canonical({k: v for k, v in packet["fixture"]["event"].items() if k not in ("id", "signature")}) == packet["fixture"]["canonicalBody"]
client = Client(packet["url"])
key = new_key()
event = client.create_identity(key, "Python 买方 😀", ["buyer"])
retrieved = client.request("/v1/events/" + event["id"])
verify_event(retrieved)
print(json.dumps({"eventId": event["id"], "identity": key["id"], "canonical": canonical(packet["vector"]), "verified": True}))
