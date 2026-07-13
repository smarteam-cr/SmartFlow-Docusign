# CLAUDE.md — Backend `docusign_integration_hs`

Backend **Fastify (Node.js + TypeScript)** que expone una REST API consumida por la HubSpot Card. Internamente habla con HubSpot CRM y DocuSign eSign vía adapters.

> 📄 **Spec del proyecto**: `../docs/specs/2026-04-27-docusign-hubspot-mvp-design.md` (en el workspace, no en este repo).
> 📄 **Reglas globales del workspace**: `../CLAUDE.md`.

---

## Stack

| Categoría | Elección | Razón |
|---|---|---|
| Lenguaje | **TypeScript** | Frontend ya es TS; contratos centrales se benefician del type-check |
| Runtime dev | **`tsx watch`** | Sin build step en dev; ciclo de iteración idéntico a JS |
| Build prod | **`tsc`** | Genera `dist/` (~2s) |
| Framework HTTP | **Fastify** | Performance, schema-based validation, pino integrado |
| Validación | **`zod`** + `fastify-type-provider-zod` | Source-of-truth única (env + HTTP), tipos TS gratis |
| Logger | **`pino`** (default Fastify) | Cero config, JSON estructurado, el más rápido de Node |
| Tests | **Jest + ts-jest** | Convención de la empresa |
| HTTP client | **`undici` / built-in `fetch`** (Node 18+) | Sin deps, AbortController para timeouts |

---

## npm scripts (esperados)

```json
{
  "dev":        "tsx watch src/server.ts",
  "build":      "tsc",
  "start":      "node dist/server.js",
  "typecheck":  "tsc --noEmit",
  "test":       "jest",
  "test:watch": "jest --watch"
}
```

`npm run typecheck` es **obligatorio** antes de cualquier commit (no hay CI todavía — disciplina manual).

---

## Estructura de carpetas (convención de empresa — no se discute)

```
src/
├── app.ts                     ← Composition Root: ÚNICO lugar que ata adapters → services
├── server.ts                  ← bootstrap (app.listen)
├── config/
│   └── env.ts                 ← lee y valida process.env con zod
├── routes/                    ← path → controller (Fastify route handlers)
├── controllers/               ← parsea/valida HTTP, llama service, formatea respuesta
├── services/                  ← casos de uso: orquestan adapters, lógica de negocio (sin HTTP)
├── integrations/              ← adapters a APIs externas (uno por integración)
│   ├── HS/                    ← HubSpot CRM
│   └── Docusign/              ← DocuSign eSign + JWT auth
├── middlewares/               ← errorHandler global, request logger, etc.
├── lib/                       ← errores, ports, logger, abstracciones compartidas
│   ├── errors/                ← AppError + jerarquía
│   ├── tenant-config/         ← TenantConfigProvider port + EnvTenantConfigProvider
│   └── template-mapping/      ← TemplateMappingResolver port + StaticTemplateMappingResolver
├── db/
│   └── models/                ← Mongoose models (vacío hoy, listo para Roadmap §15.2)
├── utils/                     ← helpers chicos
├── tasks/                     ← cron jobs (vacío hoy)
└── scripts/                   ← one-off CLI scripts (vacío hoy)
```

---

## ⚠️ Regla de dependencia (CRÍTICA — no romper)

```
routes/      →  controllers/  →  services/  →  integrations/ (vía DI)
                                       ↓
                                     lib/
```

**PERMITIDO:**
- `controllers/` importa de `services/` (vía Fastify decoration: `fastify.envelopesService`)
- `services/` recibe adapters por parámetro (DI), nunca hace `import` de `integrations/`
- `integrations/` puede usar `lib/` (errores, helpers)
- `routes/` registra controllers y aplica schemas de validación

**PROHIBIDO:**
- `services/` importando `routes/`, `controllers/`, `middlewares/`, o `integrations/` directamente
- Cualquier capa hablando con `process.env` salvo `config/env.ts` y `app.ts`
- `new` o factory cruzado entre carpetas de negocio (excepto en `app.ts`)

Si un cambio te hace dudar de esta regla, **abre el spec en §4.2 y verifica antes de proceder.**

---

## Pattern: Adapter + DI suave

**Adapter** = factory que recibe config y retorna un objeto con métodos en el lenguaje del negocio (no en el lenguaje de la API externa).

```ts
// integrations/HS/index.ts
export function createHubSpotAdapter(config: { accessToken: string }) {
  return {
    async getDealContacts(dealId: string): Promise<Contact[]> { /* v4 assoc + v3 batch-read */ },
    async getContactById(contactId: string): Promise<Contact> { /* v3 single read */ },
    async getDealPrimaryCompany(dealId: string): Promise<Company> { /* v4 assoc filtered by Primary label */ },
    async getDealOwner(dealId: string): Promise<DealOwner> { /* deal.hubspot_owner_id + /crm/v3/owners/{id} */ },
    async findJuridicoContactIds(dealId: string): Promise<string[]> { /* v4 assoc filtered by USER_DEFINED label */ },
    async getDealCapex(dealId: string): Promise<Capex[]> { /* v4 assoc + batch-read; throws if >5 */ },
    async getCompanyDirecciones(companyId: string): Promise<Direccion[]> { /* v4 assoc + batch-read */ },
    async getDealLatestQuote(dealId: string): Promise<Quote> { /* v4 assoc + batch-read; latest by hs_createdate */ },
  };
}
```

**Service** = factory que recibe adapters y retorna un objeto con casos de uso.

```ts
// services/envelopes.service.ts
export function createEnvelopesService(deps: {
  hubspot: HubSpotAdapter;
  docusign: DocusignAdapter;
  templateMapping: TemplateMappingResolver;
  templateRoles: TemplateRolesResolver;
}) {
  return {
    async sendFromTemplate(input: { dealId: string; templateId: string; contactId: string; directionId?: string }) { /* ... */ }
  };
}
```

**Composition Root** (único, en `app.ts`):

```ts
const tenantConfig    = createEnvTenantConfigProvider(env).getConfig();
const hubspot         = createHubSpotAdapter(tenantConfig.hubspot);
const docusign        = createDocusignAdapter(tenantConfig.docusign);
const templateMapping = createStaticTemplateMappingResolver();

const envelopesService = createEnvelopesService({ hubspot, docusign, templateMapping });
fastify.decorate('envelopesService', envelopesService);
```

---

## Manejo de errores

- Jerarquía: `AppError` → `ValidationError` (400/422), `NotFoundError` (404), `ExternalServiceError` (502), `ConflictError` (409). En `lib/errors/`.
- Cada error lleva `code` (string estable, ej. `CONTACT_EMAIL_MISSING`) + `httpStatus`.
- **Lanzados en el origen (adapter), traducidos a HTTP en un solo lugar (`middlewares/errorHandler.ts`)**.
- **Controllers NO usan `try/catch`** para responder errores HTTP. Solo dejan que la excepción suba al errorHandler.
- Stacktraces nunca se exponen al cliente.

Catálogo completo de error codes en spec §6.2.

---

## Validación (siempre con zod)

- **Env vars:** schema en `config/env.ts`. Si falta una variable crítica, **el server NO levanta** con mensaje claro de qué falta.
- **HTTP body:** schema vía `fastify-type-provider-zod`. Si pasa el schema, el controller asume input válido y NO re-valida.
- **Una sola fuente de validación. Sin doble validación.**

---

## Logger (pino)

| Nivel | Cuándo |
|---|---|
| `debug` | Solo en local (NODE_ENV !== production). Detalles de requests externos. |
| `info` | Flujo normal: "envelope sent", "templates fetched" |
| `warn` | `AppError` esperado (404, 422, 502). El errorHandler lo emite automáticamente. |
| `error` | Bug inesperado (cualquier `Error` no-`AppError`). El errorHandler lo emite automáticamente. |

Uso: `request.log.info({ dealId, envelopeId }, 'envelope sent')`. El primer argumento es contexto estructurado (queryable después).

---

## Hygiene de secretos (NO negociable)

- ❌ **JAMÁS** loguear `accessToken`, `privateKey`, JWTs completos, ni body de respuestas que contengan tokens.
- ✅ Si hay que loguear referencia a un token: solo últimos 4 chars con prefijo, ej. `'***' + token.slice(-4)`.
- `.env` jamás se commitea — solo `.env.example` con placeholders vacíos.
- Si el server arranca y faltan env vars críticas, **debe morir** con mensaje claro (zod hace esto automáticamente).

---

## Timeouts y reintentos

- **Timeouts SÍ:** 10s HubSpot, 15s DocuSign (vía `AbortController` en el HTTP client del adapter).
- **Retries NO en demo** — Roadmap §15.4 (3 retries con backoff exponencial + jitter, solo en 5xx/timeout, nunca en 4xx).

---

## Testing

- **154 tests unitarios** en 17 test suites. Cubren: services, controllers, adapters (HubSpot, DocuSign, Files), y lib (HMAC, tenant config, template mapping/roles).
- Adapters falsos pasados por DI (esa es la razón por la que existe DI suave).
- **Sin nock/msw, sin smoke E2E automatizado** (Roadmap §16.10). Smoke tests manuales con curls validados.
- Type checking obligatorio: `npm run typecheck` antes de commit.

---

## Variables de entorno (`.env`)

Validadas por zod en `config/env.ts`. Faltantes = server no arranca. Ver `.env.example`:

```env
# Server
PORT=3000
NODE_ENV=development

# HubSpot — Private App access token
HUBSPOT_ACCESS_TOKEN=

# DocuSign — JWT Grant
DOCUSIGN_CLIENT_ID=
DOCUSIGN_IMPERSONATED_USER_ID=
DOCUSIGN_PRIVATE_KEY=
DOCUSIGN_ACCOUNT_ID=
DOCUSIGN_BASE_PATH=https://demo.docusign.net

# Config de proveedores por template (array JSON):
# [{"id":"<template-uuid>","country":"<país proveedor / tab countryINVE>","legalRepresentativeCode":"<hs-contact-id>"}]
TEMPLATE_PROVEEDOR_MAP=[]

# DocuSign Connect webhook HMAC secret (generado por DocuSign Admin → Connect → Gestionar claves)
DOCUSIGN_CONNECT_HMAC_SECRET=

# HubSpot Portal ID (visible en la URL de HubSpot: app.hubspot.com/contacts/{portalId}/...)
HUBSPOT_PORTAL_ID=
```

Setup paso a paso de cuentas externas en spec §14 y §17.

---

## Endpoints expuestos

| Method | Path | Qué hace |
|---|---|---|
| `GET` | `/api/v1/docusign/templates` | Lista templates DocuSign disponibles |
| `GET` | `/api/v1/hubspot/deals/:dealId/contacts` | Lista contactos asociados al Deal (solo los que tienen email) |
| `POST` | `/api/v1/docusign/envelopes` | Body `{ dealId, templateId, contactId, directionId? }` → envía envelope. 409 si hay envelope activo |
| `POST` | `/api/v1/docusign/envelopes/:envelopeId/void` | Body `{ dealId, reason }` (reason min 5 chars) → cancela envelope activo. 409 si terminal |
| `GET` | `/api/v1/deals/:dealId/envelope-status` | Estado del último envelope: `{ envelopeId, status, sentAt, signedAt, pdfUrl }` |
| `GET` | `/api/v1/deals/:dealId/send-context` | Contexto para form de envío: `{ clienteMode, juridicoContact, contacts, direcciones, templates, company, capexCount, hasQuote }` |
| `POST` | `/api/v1/webhooks/docusign` | Receptor DocuSign Connect (HMAC verificado). Procesa eventos: sent, signing, completed, declined, voided |
| `GET` | `/health` | `{ status, uptime, version }` (sin auth) |

Contratos completos en spec consolidado v2 §5.1, §7.2.

---

## Si necesitas extender el sistema

| Quieres... | Toca... |
|---|---|
| Nuevo endpoint | route + controller + service. **Adapter solo si nuevo sistema externo.** |
| Nuevo error code | añade al catálogo §6.2 del spec, lánzalo desde el adapter, mapea en `errorHandler` si necesita custom |
| Nueva variable env | añade al schema zod en `config/env.ts` Y al `.env.example` |
| Cambio de contrato HTTP | si es **breaking**: bump a `/api/v2/...` manteniendo `/v1` funcionando |
| Nueva integración (ej. Salesforce) | nueva carpeta `integrations/SF/` con su factory adapter; inyectar en `app.ts` |
| Persistencia | spec §15.2 (Roadmap) — primero introducir Mongoose en `db/`, luego `MongoTenantConfigProvider` |

---

## Si dudas de una decisión

1. Lee el **spec** en `../docs/specs/`. Es la fuente de verdad.
2. Si está documentada, **sigue lo escrito**. No improvises.
3. Si no está documentada, **pregunta antes de inventar** una convención nueva — y cuando se acuerde, **documéntala** aquí o en el spec.
