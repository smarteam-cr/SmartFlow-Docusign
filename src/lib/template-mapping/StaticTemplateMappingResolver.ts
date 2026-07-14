import type { ResolutionContext, TemplateMappingResolver } from './types.js';

/** La tabla capex del template DocuSign tiene 5 filas fijas. */
export const CAPEX_TABLE_ROWS = 5;

/**
 * Maps a ResolutionContext to the Proveedor textTab labels of the DocuSign
 * template. Empty/missing sources resolve to '' (field-level tolerance).
 * Capex rows beyond the available data are sent as empty strings so the
 * fixed 5-row table renders blank cells.
 */
export function createStaticTemplateMappingResolver(): TemplateMappingResolver {
  return {
    resolveTabValues(ctx: ResolutionContext): Record<string, string> {
      const tabs: Record<string, string> = {
        country: ctx.contactoLegal?.pais ?? '',
        legalRepresentative: ctx.contactoLegal?.fullName ?? '',
        dniLegalRepresentative: ctx.contactoLegal?.dni ?? '',
        countryINVE: ctx.proveedorCountry ?? '',
        location: ctx.location ?? '',
        Commercial_Agreement: ctx.commercialAgreement ?? '',
        urlQuotation: ctx.quote?.hsQuoteLink ?? '',
        datetime: ctx.sentDate ?? '',
      };

      for (let i = 0; i < CAPEX_TABLE_ROWS; i++) {
        const c = ctx.capex?.[i];
        const slot = i + 1;
        tabs[`codeQR_${slot}`] = c?.codigo_qr ?? '';
        tabs[`descriptionCapex_${slot}`] = c?.nombre ?? '';
        tabs[`quantity_${slot}`] = c?.cantidad ?? '';
        tabs[`price_${slot}`] = c?.costoNeto ?? '';
      }

      return tabs;
    },
  };
}
