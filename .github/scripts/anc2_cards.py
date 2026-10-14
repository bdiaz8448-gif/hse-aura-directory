"""Refresh the ANC-2 directory contact cards (anc2/c/*.vcf) from the live list.

Runs in GitHub Actions. Reads the public anc2Contacts collection (no secrets
needed), writes one vCard per person, removes cards for people who were
deleted, and writes anc2/c/manifest.json so the page knows which cards are
current. Touches nothing outside anc2/c.
"""
import json, os, re, sys, urllib.request
from datetime import datetime

KEY = "AIzaSyDXrrjaKSgrMvUbJ_w2kmkiWD_n3R35ufM"
URL = "https://firestore.googleapis.com/v1/projects/aura-hse-directory/databases/(default)/documents/anc2Contacts"
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "anc2", "c")

def val(v):
    if "stringValue" in v: return v["stringValue"]
    if "arrayValue" in v: return [val(x) for x in v["arrayValue"].get("values", [])]
    if "timestampValue" in v:
        s = v["timestampValue"].replace("Z", "+00:00")
        s = re.sub(r"\.(\d{6})\d*", r".\1", s)
        return int(datetime.fromisoformat(s).timestamp() * 1000)
    if "integerValue" in v: return int(v["integerValue"])
    if "nullValue" in v: return None
    return list(v.values())[0] if v else None

def fetch():
    docs, token = [], ""
    while True:
        u = URL + "?pageSize=300&key=" + KEY + ("&pageToken=" + token if token else "")
        with urllib.request.urlopen(u, timeout=30) as r:
            d = json.load(r)
        for doc in d.get("documents", []):
            p = {k: val(v) for k, v in doc.get("fields", {}).items()}
            p["id"] = doc["name"].rsplit("/", 1)[-1]
            docs.append(p)
        token = d.get("nextPageToken")
        if not token: return docs

def esc(s): return (s or "").replace("\\", "\\\\").replace(";", "\;").replace(",", "\\,").replace("\n", "\\n")

def vcard(p):
    name = (p.get("name") or "").strip()
    nick = ""
    m = re.search(r"\(([^)]+)\)", name)
    if m:
        nick = m.group(1); name = re.sub(r"\s+", " ", name[:m.start()] + name[m.end():]).strip()
    w = name.split(); suf = ""
    if len(w) > 2 and re.match(r"^(jr|sr|ii|iii)\.?$", w[-1], re.I): suf = w.pop()
    given, family = (w[0] if w else ""), (w[-1] if len(w) > 1 else "")
    middle = " ".join(w[1:-1]) if len(w) > 2 else ""
    L = ["BEGIN:VCARD", "VERSION:3.0"]
    if p["id"] in ("amgen-security", "ats-on-site-medic"):
        L.append("N:%s;;;;" % esc(p.get("name"))); L.append("FN:" + esc(p.get("name"))); L.append("X-ABShowAs:COMPANY")
    else:
        L.append("N:%s;%s;%s;;%s" % (esc(family), esc(given), esc(middle), esc(suf)) if family else "N:%s;;;;" % esc(given))
        L.append("FN:" + esc(name + ((" " + suf) if suf else "")))
        if nick: L.append("NICKNAME:" + esc(nick))
    if p.get("company"): L.append("ORG:" + esc(p["company"]))
    if p.get("title"): L.append("TITLE:" + esc(p["title"]))
    for k, typ in (("phone", "CELL"), ("phone2", "WORK")):
        d = re.sub(r"\D", "", p.get(k) or "")
        if d: L.append("TEL;TYPE=%s,VOICE:%s" % (typ, d))
    if p.get("email"): L.append("EMAIL;TYPE=INTERNET,WORK:" + esc(p["email"]))
    L.append("NOTE:" + esc("Amgen ANC-2 (Bengal)"))
    L.append("END:VCARD")
    return "\r\n".join(L) + "\r\n"

def main():
    docs = fetch()
    if not docs:
        print("Live list is empty - leaving the existing cards alone."); return
    os.makedirs(OUT, exist_ok=True)
    keep, cards = set(), {}
    for p in docs:
        if not re.match(r"^[a-z0-9-]{1,80}$", p["id"]): continue
        keep.add(p["id"] + ".vcf")
        with open(os.path.join(OUT, p["id"] + ".vcf"), "w", encoding="utf-8", newline="") as fh:
            fh.write(vcard(p))
        cards[p["id"]] = p.get("updatedAt") or 0
    for f in os.listdir(OUT):
        if f.endswith(".vcf") and f not in keep: os.remove(os.path.join(OUT, f))
    with open(os.path.join(OUT, "manifest.json"), "w") as fh:
        json.dump({"cards": dict(sorted(cards.items()))}, fh, indent=0, sort_keys=True)
    print("cards:", len(cards))

if __name__ == "__main__":
    main()
