/**
 * One-off: lista los tabs (por recipiente) de un template de DocuSign para
 * validar los tabLabels reales.
 * Ejecutar desde la raíz del proyecto: npx tsx <ruta>/list-template-tabs.ts <templateId>
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';

const templateId = process.argv[2];
if (!templateId) {
  console.error('Uso: npx tsx list-template-tabs.ts <templateId>');
  process.exit(1);
}

const basePath = process.env.DOCUSIGN_BASE_PATH!;
const accountId = process.env.DOCUSIGN_ACCOUNT_ID!;
const oauthHost = /demo/i.test(basePath) ? 'account-d.docusign.com' : 'account.docusign.com';

async function getToken(): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const signed = jwt.sign(
    {
      iss: process.env.DOCUSIGN_CLIENT_ID!,
      sub: process.env.DOCUSIGN_IMPERSONATED_USER_ID!,
      aud: oauthHost,
      iat: nowSec,
      exp: nowSec + 3600,
      scope: 'signature impersonation',
    },
    process.env.DOCUSIGN_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    { algorithm: 'RS256' }
  );
  const res = await fetch(`https://${oauthHost}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signed,
    }),
  });
  if (!res.ok) throw new Error(`OAuth ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function main() {
  const token = await getToken();
  const url = `${basePath}/restapi/v2.1/accounts/${accountId}/templates/${templateId}/recipients?include_tabs=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.error(`DocuSign respondió ${res.status}: ${(await res.text()).slice(0, 500)}`);
    process.exit(1);
  }
  const body = (await res.json()) as {
    signers?: Array<{
      roleName?: string;
      recipientId?: string;
      tabs?: Record<string, Array<{ tabLabel?: string }>>;
    }>;
  };

  for (const signer of body.signers ?? []) {
    console.log(`\n=== Rol: ${signer.roleName} (recipientId ${signer.recipientId}) ===`);
    for (const [tabType, list] of Object.entries(signer.tabs ?? {})) {
      if (!Array.isArray(list)) continue;
      for (const t of list) {
        console.log(`  [${tabType}] tabLabel="${t.tabLabel ?? ''}"`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
