import type { MappingContext, TemplateMappingResolver } from './types.js';

/**
 * Demo implementation: ignores templateId, always returns the 11 tabLabels
 * required by the demo template.
 *
 * The resolver does NOT validate emptiness — that is done by the service after
 * this function returns (single source of validation).
 *
 * Templates in DocuSign MUST have textTabs with these tabLabels for this
 * resolver to work. Spec §9.3 documents the list.
 */
export function createStaticTemplateMappingResolver(): TemplateMappingResolver {
  return {
    resolveTabValues(ctx: MappingContext): Record<string, string> {
      return {
        Nombre: ctx.contact.firstName,
        Apellido: ctx.contact.lastName,
        NumeroIdentificacionComodatario: ctx.contactDetails.identification,
        PaisContactoComodatario: ctx.contactDetails.country,
        EmpresaComodatario: ctx.company.name,
        PaisEmpresaComodatario: ctx.company.country,
        DireccionEmpresaComodatario: ctx.company.address,
        NombreProducto: ctx.lineItem.name,
        SkuProducto: ctx.lineItem.sku,
        PrecioProducto: ctx.lineItem.price,
        Moneda: ctx.dealCurrencyCode,
      };
    },
  };
}
