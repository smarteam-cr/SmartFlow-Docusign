import { z } from 'zod';
import type { TemplateRolesResolver } from './types.js';

const mapSchema = z.record(z.string());

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
      `TEMPLATE_PROVEEDOR_MAP debe ser un objeto JSON con claves y valores string: "${mapJson.slice(0, 120)}"`
    );
  }
  const parsedMap = result.data;
  return {
    getProveedorContactId(templateId: string): string | undefined {
      return parsedMap[templateId];
    },
  };
}
