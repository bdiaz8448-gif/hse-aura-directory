# Turn on Twilio sending (about 10 minutes, all in a browser)

Right now the notify button opens **your own Messages app** and texts from
**your personal number**. On iPhone it also reaches only **one** person,
because iOS caps a web `sms:` link at a single recipient.

After this setup, the message goes out **from your Twilio number, to everyone
tagged, automatically** — nobody has to tap send.

Nothing here is risky. If it isn't finished, or it ever fails, the app quietly
falls back to what it does today.

---

## Why a separate service is required

Twilio needs your **Auth Token** to send. That token can never live in the
directory itself — that code is public and runs in the browser, so anyone
could read it and send texts on your account.

The token lives in Cloudflare instead, encrypted, and never leaves their
server. **I never see it. You paste it yourself.**

---

## Step 1 — Collect three values from Twilio

Go to the Twilio Console home page (console.twilio.com).

| Value | Where it is |
|---|---|
| **Account SID** | Front page. Starts with `AC` |
| **Auth Token** | Front page, next to the SID. Click to reveal |
| **From number** | Your Twilio phone number, e.g. `+16615604579` |

> Treat the Auth Token like a password. Don't email or text it to anyone,
> and don't paste it into a chat — including this one.

## Step 2 — Create the Cloudflare Worker (free)

1. Sign up / log in at **dash.cloudflare.com** (free plan is fine)
2. Left menu → **Workers & Pages** → **Create** → **Create Worker**
3. Name it `aura-notify` → **Deploy**
4. Click **Edit code**
5. Delete everything in the editor
6. Open `worker/twilio-notify.js` from this folder, copy all of it, paste it in
7. **Deploy**

## Step 3 — Add your three secrets

Still in the Worker → **Settings** → **Variables and Secrets** → **Add**

Add each one as type **Secret** (not plain text):

| Name | Value |
|---|---|
| `TWILIO_ACCOUNT_SID` | your Account SID |
| `TWILIO_AUTH_TOKEN` | your Auth Token |
| `TWILIO_FROM_NUMBER` | your Twilio number, `+1` format |

Click **Deploy** again.

## Step 4 — Optional but recommended: the double-tap guard

Workers & Pages → **KV** → **Create namespace** → name it `aura-notify-kv`.
Then in the Worker → Settings → Variables → **KV Namespace Bindings** → Add:

- Variable name: `NOTIFY_KV`
- Namespace: `aura-notify-kv`

This blocks a second send to the same building within 45 seconds, so a panicked
double-tap doesn't text everyone twice.

## Step 5 — Give me the URL

Your worker has an address like:

```
https://aura-notify.YOUR-NAME.workers.dev
```

Send me that URL and I'll wire it into the app and test it end to end.
(The URL is not a secret — it's safe to paste in chat. The token is not.)

---

## What happens after

- Tap **Send / Enviar** → message goes out from the Twilio number to everyone tagged
- The screen confirms who it reached
- If Twilio is down, unreachable, or slow (6 seconds), it automatically falls
  back to opening your Messages app — the emergency path never dead-ends

## Cost

- Cloudflare Worker: **free** (100,000 requests/day)
- Twilio SMS: about **$0.008 per text**. Two recipients ≈ 1.6 cents per alert.
- Your balance was $26.70, which is thousands of alerts.

## Security notes

The worker URL is public, but it is built so abuse is pointless:

- It accepts only `{"building":"DSM4"}` or `{"building":"DSM3"}`
- **No caller can supply phone numbers or message text** — both are fixed
  server-side
- Recipients are read live from the directory's notify tags
- Requests must come from the directory's own web address

The worst anyone could do with the URL is trigger a real safety notification
to the HSE team. They cannot send arbitrary texts to arbitrary people.

## Check your A2P registration first

Your Twilio console showed **"A2P Messaging registration — Started 06/27"**.
If that is still not marked complete/approved, messages to US numbers may be
blocked by the carriers regardless of this setup. Worth confirming in
Messaging → Regulatory Compliance before testing.
