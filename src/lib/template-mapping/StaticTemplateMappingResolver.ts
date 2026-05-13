import type { MappingContext, TemplateMappingResolver } from './types.js';

/**
 * Demo implementation: ignores templateId, returns 11 tabLabels mapped from
 * the MappingContext.
 *
 * Tolerancia field-level (spec v2 §11): cualquier source que llegue como
 * empty string, null o undefined se convierte a '' antes de salir. Nunca
 * lanza por field-level missing data. Las validaciones estructurales viven
 * en el service.
 *
 * Templates en DocuSign deben tener textTabs con estos tabLabels para que
 * los valores prellenen. Required-ness por field se enforce en el template
 * (UI DocuSign), NO en el backend.
 */
export function createStaticTemplateMappingResolver(): TemplateMappingResolver {
  return {
    resolveTabValues(ctx: MappingContext): Record<string, string> {
      return {
        Nombre: ctx.contact.firstName ?? '',
        Apellido: ctx.contact.lastName ?? '',
        NumeroIdentificacionComodatario: ctx.contactDetails.identification ?? '',
        PaisContactoComodatario: ctx.contactDetails.country ?? '',
        EmpresaComodatario: ctx.company.name ?? '',
        PaisEmpresaComodatario: ctx.company.country ?? '',
        DireccionEmpresaComodatario: ctx.company.address ?? '',
        NombreProducto: ctx.lineItem.name ?? '',
        SkuProducto: ctx.lineItem.sku ?? '',
        PrecioProducto: ctx.lineItem.price ?? '',
        Moneda: ctx.dealCurrencyCode ?? '',
      };
    },
  };
}
