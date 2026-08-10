import { z } from 'zod';
import type {
  CmTemplateConfig,
  ProveedorTemplateConfig,
  TemplateRolesResolver,
} from './types.js';

const mapSchema = z.array(
  z.object({
    id: z.string().min(1),
    country: z.string().min(1),
    legalRepresentativeCode: z.string().min(1),
    // Opcional en el schema para no matar el boot con .env viejos; si falta o
    // viene vacío, el envío falla con CM_NOT_CONFIGURED (422) en el service.
    cmIdHubspotCode: z.string().optional(),
  })
);

export function createStaticTemplateRolesResolver(mapJson: string): TemplateRolesResolver {
  let parsed: unknown;
  try {
    parsed = JSON.parse(mapJson);
  } catch {
    throw new Error(`TEMPLATE_PROVEEDOR_MAP no es JSON válido: "${mapJson.slice(0, 120)}"`);
  }
  const result = mapSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `TEMPLATE_PROVEEDOR_MAP debe ser un array JSON de objetos { id, country, legalRepresentativeCode, cmIdHubspotCode }: "${mapJson.slice(0, 120)}"`
    );
  }
  const byTemplateId = new Map<string, ProveedorTemplateConfig>(
    result.data.map((e) => [e.id, { contactId: e.legalRepresentativeCode, country: e.country }])
  );
  const cmByTemplateId = new Map<string, CmTemplateConfig>(
    result.data
      .filter((e) => (e.cmIdHubspotCode ?? '').trim() !== '')
      .map((e) => [e.id, { contactId: e.cmIdHubspotCode!.trim() }])
  );
  return {
    getProveedorConfig(templateId: string): ProveedorTemplateConfig | undefined {
      return byTemplateId.get(templateId);
    },
    getCmConfig(templateId: string): CmTemplateConfig | undefined {
      return cmByTemplateId.get(templateId);
    },
  };
}
