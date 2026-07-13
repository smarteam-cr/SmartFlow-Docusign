import { z } from 'zod';
import type { ProveedorTemplateConfig, TemplateRolesResolver } from './types.js';

const mapSchema = z.array(
  z.object({
    id: z.string().min(1),
    country: z.string().min(1),
    legalRepresentativeCode: z.string().min(1),
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
      `TEMPLATE_PROVEEDOR_MAP debe ser un array JSON de objetos { id, country, legalRepresentativeCode }: "${mapJson.slice(0, 120)}"`
    );
  }
  const byTemplateId = new Map<string, ProveedorTemplateConfig>(
    result.data.map((e) => [e.id, { contactId: e.legalRepresentativeCode, country: e.country }])
  );
  return {
    getProveedorConfig(templateId: string): ProveedorTemplateConfig | undefined {
      return byTemplateId.get(templateId);
    },
  };
}
