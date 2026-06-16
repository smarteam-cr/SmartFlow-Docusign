# DocuSign + HubSpot — Backend (`docusign_integration_hs`)

API REST en **Fastify (Node.js + TypeScript)** que conecta **HubSpot CRM** con **DocuSign eSign**.
Permite enviar un documento para firmar desde un Deal de HubSpot, con los datos del contacto, la
empresa, el dueño del Deal, la cotización y los capex pre-rellenados en el documento de DocuSign.

> Repo GitHub: `git@github.com:smarteam-cr/SmartFlow-Docusign.git`
> Es consumido por la HubSpot Card (`react_CLI_hs_card`).

---

## 1. Descripción general

- **Qué hace:** orquesta el envío de envelopes de DocuSign desde HubSpot y devuelve el estado de la firma.
- **Dependencias externas:**
  - **HubSpot CRM** (REST API v3/v4) — lee Deal, contactos, empresa, dueño, cotización, capex y direcciones; sube el PDF firmado a HubSpot Files y crea una Note.
  - **DocuSign eSign** (REST API + JWT Grant) — crea y cancela envelopes; recibe eventos vía DocuSign Connect (webhook con HMAC).
- **Base de datos:** **ninguna**. El backend es *stateless*; todo el estado vive en HubSpot (Deal properties) y DocuSign. La carpeta `src/db/` queda preparada para Mongo (Roadmap).
- **WordPress u otro CMS:** no aplica.

---

## 2. Stack

| Área | Elección |
|---|---|
| Lenguaje | TypeScript |
| Framework HTTP | Fastify 4 |
| Validación | `zod` (env vars + body HTTP) |
| Auth DocuSign | JWT Grant (`jsonwebtoken`) |
| Logger | `pino` (integrado en Fastify) |
| HTTP client | `fetch` nativo (Node ≥18) con `AbortController` |
| Tests | Jest + ts-jest (166 tests) |

---

## 3. Ejecución local

### Requisitos previos
- **Node.js ≥ 20**
- Cuenta **HubSpot** con una *Private App* (access token + scopes de contacts, companies, deals, quotes, custom objects, files).
- Cuenta **DocuSign developer** con *Integration Key* (JWT), usuario impersonado y clave privada RSA.

### Instalación
```bash
npm install
```

### Variables de entorno
Copia `.env.example` a `.env` y rellena los valores (las credenciales **no** se commitean).

| Variable | Para qué sirve |
|---|---|
| `PORT` | Puerto del server (default 3000) |
| `NODE_ENV` | `development` \| `test` \| `production` |
| `HUBSPOT_ACCESS_TOKEN` | Token de la Private App de HubSpot |
| `HUBSPOT_PORTAL_ID` | ID del portal (para URLs de PDF y correlación del webhook) |
| `DOCUSIGN_CLIENT_ID` | Integration Key de DocuSign |
| `DOCUSIGN_IMPERSONATED_USER_ID` | UUID del usuario DocuSign a impersonar |
| `DOCUSIGN_PRIVATE_KEY` | Clave RSA en una sola línea con `\n` literales |
| `DOCUSIGN_ACCOUNT_ID` | ID de la cuenta DocuSign |
| `DOCUSIGN_BASE_PATH` | `https://demo.docusign.net` (sandbox) / `https://www.docusign.net` (prod) |
| `TEMPLATE_PROVEEDOR_MAP` | JSON `{ "<templateId>": "<hs-contactId del proveedor>" }` |
| `DOCUSIGN_CONNECT_HMAC_SECRET` | Secreto HMAC para verificar el webhook de DocuSign Connect |

> El server **no arranca** si falta una variable crítica: `zod` valida `process.env` al boot y muere con un mensaje claro.

### Comandos
```bash
npm run dev        # desarrollo con recarga (tsx watch)
npm run typecheck  # chequeo de tipos (obligatorio antes de commit)
npm test           # 166 tests unitarios
npm run build      # compila a dist/
npm start          # corre dist/server.js (producción)
```

### Ambientes
- **Desarrollo:** DocuSign sandbox (`demo.docusign.net`) + portal HubSpot de pruebas.
- **Producción:** DocuSign productivo (`www.docusign.net`, Integration Key con Go-Live) + portal HubSpot del cliente. Checklist completo en el spec §17.

---

## 4. Arquitectura

Arquitectura **hexagonal** con DI suave: el código de negocio nunca importa infraestructura; todo se
ensambla en un único *Composition Root* (`src/app.ts`).

```
src/
├── app.ts            ← Composition Root: ata adapters → services → controllers → routes
├── server.ts         ← bootstrap (loadEnv + listen + graceful shutdown)
├── config/env.ts     ← valida process.env con zod
├── routes/           ← path → controller
├── controllers/      ← parsea/valida HTTP, llama al service, formatea respuesta
├── services/         ← casos de uso (lógica de negocio, sin HTTP)
├── integrations/     ← adapters a APIs externas
│   ├── HS/           ← HubSpot CRM + HubSpot Files
│   └── Docusign/     ← DocuSign eSign + JWT auth
├── middlewares/      ← errorHandler global (AppError → HTTP)
├── lib/              ← errores, HMAC y "ports" (tenant-config, template-mapping, template-roles)
└── utils/            ← helpers
```

**Regla de dependencia:** `routes → controllers → services → integrations` (inyectadas por parámetro).
Los services reciben los adapters por DI; nunca hacen `import` de `integrations/`.

### Endpoints (prefijo `/api/v1`)

| Método | Path | Qué hace |
|---|---|---|
| `GET` | `/docusign/templates` | Lista templates de DocuSign |
| `GET` | `/deals/:dealId/send-context` | Contexto para el formulario de envío (templates, contactos, direcciones, modo jurídico) |
| `GET` | `/deals/:dealId/envelope-status` | Estado del último envelope (`status`, `sentAt`, `signedAt`, `pdfUrl`) |
| `POST` | `/docusign/envelopes` | Envía un envelope (`{ dealId, templateId, contactId, directionId? }`). `409` si ya hay uno activo |
| `POST` | `/docusign/envelopes/:envelopeId/void` | Cancela un envelope activo (`{ dealId, reason }`). `409` si ya es terminal |
| `POST` | `/webhooks/docusign` | Receptor de DocuSign Connect (HMAC verificado) |
| `GET` | `/health` | Health check (sin auth) — **fuera** del prefijo `/api/v1` |

### Probar el webhook en local (sin ngrok)
Tras firmar el primer firmante, simula el evento de DocuSign Connect contra `localhost`:
ver `../script-to-completed.txt` en la carpeta del workspace.

---

## 5. Pendientes, riesgos y recomendaciones

**Tareas pendientes**
- Plan 13 — Base de datos (Mongo) + base multi-tenant.
- Plan 14 — Onboarding a producción del primer cliente (checklist en spec §17).
- Plan 15 — OAuth + multi-tenant real.

**Incidencias conocidas**
- El **sandbox de DocuSign no envía emails de forma consistente** al 2º y 3er firmante, por lo que el
  flujo completo de 3 firmas no se pudo verificar e2e en sandbox. Se valida en producción.

**Riesgos / deuda consciente**
- Sin reintentos ante fallos transitorios de HubSpot/DocuSign (solo timeouts: 10s HubSpot, 15s DocuSign).
- Solo tests unitarios (adapters falsos por DI); no hay E2E automatizado.
- `TEMPLATE_PROVEEDOR_MAP` y los mappings de campos son estáticos (hardcoded por env); pasarán a BD por tenant.

**Dependencias con terceros**
- HubSpot CRM API, DocuSign eSign API y DocuSign Connect (webhook). Cualquier cambio de sus contratos
  afecta solo a los adapters de `src/integrations/`.

> Fuente de verdad del diseño: `../docs/specs/2026-05-13-grupo-inve-v2-consolidated-design.md`.
