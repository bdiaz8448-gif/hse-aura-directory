# Amgen ANC-2 — HSE Directory

Phone-friendly contact directory for the Amgen ANC-2 (Bengal) project, Holly Springs, NC.
Lives in its own folder; nothing outside this folder is used or changed.

- `index.html` — the whole app (contacts are built into the page)
- `c/<id>.vcf` — one contact card per person; "Save to Contacts" links here
- The `.nojekyll` file at the site root is required, or GitHub Pages will not serve the cards
- A `noindex` tag keeps search engines from listing the page

To update: change the contact list, rebuild `index.html` and `c/`, push both.
No PINs, passwords, door codes or Wi-Fi details belong here — the repo is public.
