# Fujifilm Aura Project — HSE Directory

**Live site: https://bdiaz8448-gif.github.io/hse-aura-directory/**

This is the ONE canonical directory. Do not create another repo or move the
domain. The old repo `FujiFilm-HSE-Directory-Guide` is retired and only
redirects here.

---

## ⚠️ Read before changing anything

### 1. The domain is tied to Twilio — do not move it
`privacy.html` and `terms.html` are the URLs submitted to Twilio for the
A2P 10DLC campaign ("HSE Aura Alerts"). Changing the domain, renaming those
files, or deleting them **voids the SMS registration**, which took
considerable effort to get approved. Leave them where they are.

Note: no app code calls the Twilio API. Emergency notify uses plain `sms:`
links that open the phone's own messaging app.

### 2. Save to Contacts — do NOT "improve" this
Contact cards are **real static `.vcf` files** in `/c/<firestore-id>.vcf`,
linked by a plain `<a href>`. This looks primitive. It is deliberate.

Every scripted approach was tried on real devices and **all of them failed**:

| Approach | Result on iPhone |
|---|---|
| `data:text/vcard` link | blocked by WebKit (anti-phishing) |
| `blob:` URL navigation | blocked / silently does nothing |
| `URL.createObjectURL` + programmatic `.click()` | blocked |
| Web Share API (`navigator.share`) | sheet opens but has **no** "Add to Contacts" |
| QR code | useless — you cannot scan your own phone |
| Service worker for offline | served stale builds; broke Firestore live sync |

A real `.vcf` at a real https address is the only thing every platform
imports natively. GitHub Pages serves it as `text/x-vcard`.

**`.nojekyll` must stay.** Without it Jekyll ignores files/folders and the
cards 404.

### 3. Inline `onclick=` handlers must be exported to `window`
This cost days. Functions declared inside the app's closure are invisible to
inline `onclick=` attributes, which are evaluated in **global** scope. A tap
threw `ReferenceError: saveVcf is not defined`, the handler never ran, and
the link silently fell through. Anything referenced from an `onclick=` must
have `window.thing = thing;`.

### 4. vCard `N:` is mandatory
Without an `N:` property, Apple Contacts and Android treat the card as a
company and display `ORG` (e.g. "JACOBS") where the person's name belongs.
Also escape `;` `,` `\` per RFC 2426 — an unescaped `;` in a job title
corrupts every field after it.

### 5. Firestore listeners need `includeMetadataChanges: true`
With offline persistence on, the first snapshot is always `fromCache: true`.
Without this option the listener never re-fires on the cache→server
transition, so the header lies "Offline" forever while sync works fine.

### 6. No service worker. On purpose.
It repeatedly served stale HTML, so shipped fixes appeared broken because
they never reached the device. If offline support is added back, it must
never intercept `firestore.googleapis.com` and never cache `index.html`.

---

## How saving works now

One button. It detects the browser and routes itself — no user instructions.

| Where opened | Behaviour |
|---|---|
| Safari / Chrome / Firefox / Edge (iOS) | follows the link, imports |
| Home-screen install | follows the link, imports |
| Gmail / Messages / Outlook / Teams / LinkedIn (iOS) | `x-safari-https://` → jumps to Safari, imports |
| Android WebView (in-app) | `intent://` → jumps to Chrome, imports |
| Android Chrome, Mac, Windows | downloads the `.vcf` |

---

## Regenerating contact cards

`/c/*.vcf` is a **static snapshot**. A contact added in the app has no card
until the files are regenerated.

1. Open the site, run in the browser console:
   ```js
   var s = await firebase.firestore().collection('contacts').get();
   var r=[]; s.forEach(d=>{var c=d.data();
     r.push([d.id,c.name||'',c.role||'',c.company||'',c.cellPhone||'',
             c.officePhone||'',c.email||'',c.trailer||''].join('\t'));});
   copy(r.join('\n'));
   ```
2. Paste into `contacts.tsv`
3. Run the generator (see `tools/gen_vcf.py`) writing into `c/`
4. Commit and push

---

## Build marker
A version string is shown at the bottom of the page next to the Privacy
link. If someone reports a bug, **ask what that marker says first** — a
stale cached build wasted several debugging rounds.

Current: `v15-universal`

---

## Secrets
No credentials, PINs, or tokens belong in this repo — it is **public**.
The admin PIN and company PINs live in Firestore, editable in the app
under the lock icon. Do not commit them here.

---

## Feature log (added after v15)

| Build | What changed |
|---|---|
| v16 | Twilio sending restored — reconnected the `bitter-moon-3327` Cloudflare worker the site consolidation had dropped |
| v17 | Incident log paginated (10/page, every tab); multi-admin system with named PINs + site Activity log; dark-mode label + PIN-modal contrast fixes |
| v18 | Owner can rename buildings/rosters — updates tabs, emergency screens, checkboxes AND the SMS text |
| v19 | Owner can ADD buildings/rosters — each gets a live tab, membership via contact checkboxes |
| v20 | Admin button row wraps on phones — nothing runs off-screen |
| v21 | Pending always visible while unlocked; Owner name + PIN + ownership transfer, owner-eyes only |
| v22 | Pending Requests panel made readable; fixed approved contacts losing their phone (`cell` -> `cellPhone`) |
| v23 | Delete now removes a person from EVERY roster (was only unlinking DSM4, leaving orphans) |
| v24 | Privacy acknowledgement shown inside the Join / Add person forms |
| v25 | Right-click menu includes owner-added buildings; clear cyan hover everywhere |
| v26–v27 | Uniform blue hover frame on every card regardless of company |

### Access tiers
- **Owner** — the `config/app.editPin`. Sees the Owner box (name/PIN/transfer) and the Buildings panel. Owner status is a session flag set at unlock, never inferred from the display name.
- **Admin** — named entries in `config/admins`. Own PIN, full edit rights, can manage the admin list. Never sees the Owner box or Buildings.
- **Company** — company PINs, read-only view of their own incidents.

### Where things live in Firestore
```
config/app             editPin, ownerName
config/admins          {list:[{name,pin}]}
config/labels          renamed built-in buildings
config/customRosters   {list:[{id,name}]}  owner-added buildings
config/emergencyState  active emergency banner
auditLog               who unlocked / visits / edits  (Activity panel)
contacts               people; customRosters map = custom building membership
dsm4 dsm3 weekend cqv nightshift   roster copies, linkedContactId -> contacts
incidents, joinRequests, removalRequests
```

### Gotchas worth remembering
- `.card.jacobs-card` sits after `.card:hover` at equal specificity — any new hover styling needs the `.card.jacobs-card:hover` twin or Jacobs cards silently keep their olive border.
- Roster tabs hold their **own copy** of a person. Anything that deletes or renames must handle all five collections plus the `customRosters` map.
- Avoid `transform` on card hover: sub-pixel shifts make borders render inconsistently across the grid.
