import http from 'http';
import { URL } from 'url';
import crypto from 'crypto';
import { getAuthorizationUrl, handleOAuthCallback } from '../tools/calendarTool.js';
import path from 'node:path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../../.env.local');
dotenv.config({ path: envPath });

const PORT = Number(process.env.GOOGLE_AUTH_PORT ?? 3000);
const HOST = 'localhost';
const DEMO_USER_ID = process.env.DEMO_USER_ID ?? 'demo-user';

async function main() {
  const state = crypto.randomBytes(16).toString('hex');
  const { url, codeVerifier } = getAuthorizationUrl(state);

  console.log('\n=== Google OAuth (PKCE) for Calendar Demo ===');
  console.log(`User ID: ${DEMO_USER_ID}`);
  console.log(`Open this URL in your browser to authorize:`);
  console.log(url);

  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) return;
      const fullUrl = new URL(req.url, `http://${HOST}:${PORT}`);
      if (fullUrl.pathname !== '/oauth2/callback') {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      const code = fullUrl.searchParams.get('code');
      const recvState = fullUrl.searchParams.get('state');
      if (!code || recvState !== state) {
        res.statusCode = 400;
        res.end('Invalid request');
        return;
      }

      await handleOAuthCallback(DEMO_USER_ID, code, codeVerifier);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Authorization complete. You can close this tab.');

      console.log('\nSuccess: refresh token stored securely.');
      server.close();
    } catch (err) {
      console.error('Auth error:', err);
      try {
        res.statusCode = 500;
        res.end('Internal error');
      } catch {}
      server.close();
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`\nWaiting for callback at http://${HOST}:${PORT}/oauth2/callback`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
