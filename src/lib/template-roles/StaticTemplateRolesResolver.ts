import type { TemplateRolesResolver } from './types.js';

export function createStaticTemplateRolesResolver(mapJson: string): TemplateRolesResolver {
  let parsedMap: Record<string, string>;
  try {
    parsedMap = JSON.parse(mapJson) as Record<string, string>;
  } catch {
    throw new Error(`TEMPLATE_PROVEEDOR_MAP no es JSON válido: "${mapJson.slice(0, 120)}"`);
  }
  return {
    getProveedorContactId(templateId: string): string | undefined {
      return parsedMap[templateId];
    },
  };
}
