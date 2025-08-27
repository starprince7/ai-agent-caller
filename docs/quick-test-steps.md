# Quick test steps

These steps let you run the voice agent locally and demo Google Calendar integration.

## Prerequisites

- Node 18+
- pnpm 9+
- A Google OAuth Client (Web application) with:
  - Authorized redirect URI: `http://127.0.0.1:3000/oauth2/callback`

## 1) Configure environment

Create `.env.local` in the project root (or update it if it exists):

```
GOOGLE_CLIENT_ID=<your_web_client_id>
GOOGLE_REDIRECT_URI=http://127.0.0.1:3000/oauth2/callback
# Base64-encoded 32-byte key. Example: `openssl rand -base64 32`
ENCRYPTION_KEY=<base64-32-bytes>
# Optional: set a friendly user id for local storage of tokens/prefs
DEMO_USER_ID=demo-user
# Optional: set a refresh token to skip OAuth entirely
# GOOGLE_REFRESH_TOKEN=<your_refresh_token>
```

### Generate ENCRYPTION_KEY

You need a 32‑byte key, base64‑encoded.

- mac/Linux (OpenSSL):

```
openssl rand -base64 32
```

- Node.js:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

- Windows PowerShell:

```
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Optional validation:

```
node -e "const k=process.argv[1]; console.log(Buffer.from(k,'base64').length===32?'OK':'BAD')" "<paste>"
```

Install dependencies:

```
pnpm install
```

## 2) Authorize Google Calendar (one-time)

Run the helper to complete OAuth PKCE. This securely stores an encrypted refresh token in `data/tokens.json` for `DEMO_USER_ID`.

```
pnpm auth:google
```

- Open the URL printed in the terminal and grant access.
- On success, the terminal shows: “Success: refresh token stored securely.”

Tip: If you set `GOOGLE_REFRESH_TOKEN` in `.env.local`, this step is optional.

## 3) Start the agent

```
pnpm build
pnpm start
```

Try voice prompts like:

- “List my calendars.”
- “Set my working hours to Monday to Friday, 9:00 to 17:30 in Europe/London.”
- “When can I come in tomorrow for 30 minutes?”
- “Create a meeting tomorrow 10:00 to 11:00 with alice@example.com.”
- “Reschedule that meeting to 11:30 to 12:00.”
- “Cancel the meeting.”

## Scopes & least privilege

The app uses:
- `https://www.googleapis.com/auth/calendar.readonly`
- `https://www.googleapis.com/auth/calendar.events`

## Time zones

Times are normalized with Luxon and IANA zones (e.g., `Europe/London`).

## Retries

429 and 5xx Google API responses are retried with exponential backoff and jitter.

---

# Deploying with Docker: preserving OAuth authorization

You have two safe options to keep authorization when running in a container:

1) Provide the refresh token via environment variables (simple, recommended)

- After authorizing locally once, extract your refresh token (or copy it from your vault/KMS) and set it in the container as an env var:

```
GOOGLE_REFRESH_TOKEN=<refresh_token_value>
```

- The app prefers `GOOGLE_REFRESH_TOKEN` over the stored token file. No volume is required.
- Store the value using a secure secret mechanism in your platform (e.g., Render/Heroku/Netlify/Cloud Run secrets), not committed to source control.

2) Mount a persistent volume for the encrypted token file

- Run the local OAuth, which stores `data/tokens.json` (encrypted with `ENCRYPTION_KEY`).
- In Docker, mount a volume to persist `data/`:

```
-v /secure/path/agent-data:/app/data
```

- Ensure the same `ENCRYPTION_KEY` is provided to the container so the token can be decrypted.

Security considerations:
- Never commit tokens or `ENCRYPTION_KEY` to git.
- Prefer a secret manager (KMS, platform secrets) for `ENCRYPTION_KEY` and `GOOGLE_REFRESH_TOKEN`.
- If you rotate `ENCRYPTION_KEY`, re-encrypt stored secrets or switch to a vault-managed value.

Recommended approach:
- For demos and simple deployments, use option (1): set `GOOGLE_REFRESH_TOKEN` as an environment secret.
- For longer-lived deployments, consider a managed secret store (AWS/GCP/Azure) and initialize the app with `GOOGLE_REFRESH_TOKEN` from that store at boot.
