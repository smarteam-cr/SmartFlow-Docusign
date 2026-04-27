import type { MappingContext, TemplateMappingResolver } from './types.js';

/**
 * Demo implementation: ignores templateId, always returns
 * { Nombre, Apellido } from contact's firstName/lastName.
 *
 * Templates in DocuSign MUST have textTabs with tabLabel="Nombre" and
 * tabLabel="Apellido" for this resolver to work. This is documented in
 * spec §14 (DocuSign account setup).
 */
export function createStaticTemplateMappingResolver(): TemplateMappingResolver {
  return {
    resolveTabValues(ctx: MappingContext): Record<string, string> {
      return {
        Nombre: ctx.contact.firstName,
        Apellido: ctx.contact.lastName,
      };
    },
  };
}
