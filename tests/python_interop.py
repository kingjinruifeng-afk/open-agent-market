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
legacy = client.reputation(key["id"])
evidence = client.reputation(key["id"], "evidence-v2")
assert legacy["acceptedTrades"] == evidence["acceptedAgreements"] == 0
assert evidence["viewVersion"] == "evidence/0.2"
assert evidence["counterpartyIndependence"] == "not-verified"
assert "acceptedTrades" not in evidence
old_seller = client.reputation(packet["reputationSubject"])
new_seller = client.reputation(packet["reputationSubject"], "evidence-v2")
assert old_seller["acceptedTrades"] == new_seller["acceptedAgreements"] == 1
old_dim = old_seller["dimensions"]["seller:service"]
new_dim = new_seller["dimensions"]["seller:service"]
assert old_dim["meanMilli"] == new_dim["meanMilli"] == 4000
assert old_dim["independentCounterparties"] == new_dim["distinctCounterpartyIdentities"] == 1
assert new_dim["maxSamplesFromOneIdentity"] == 1
try:
    client.reputation(key["id"], "unknown")
    raise AssertionError("Unknown view accepted")
except ValueError as error:
    assert str(error) == "BAD_REPUTATION_VIEW"
print(json.dumps({"eventId": event["id"], "identity": key["id"], "canonical": canonical(packet["vector"]), "verified": True}))
