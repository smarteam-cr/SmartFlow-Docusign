import type { ResolutionContext, TemplateMappingResolver } from './types.js';

/**
 * Maps a ResolutionContext to the 31 Propietario textTab labels defined in
 * spec §11.3. Empty/missing sources resolve to ''. The 6 tabs filled by
 * signers in DocuSign UI (AcreditacionCliente, DocInscrCliente, etc.) are
 * NOT emitted — DocuSign keeps them from the template.
 */
export function createStaticTemplateMappingResolver(): TemplateMappingResolver {
  return {
    resolveTabValues(ctx: ResolutionContext): Record<string, string> {
      const tabs: Record<string, string> = {
        RazonSocial: ctx.company?.razonSocial ?? '',
        PaisRazonSocial: ctx.company?.pais ?? '',
        NombreCliente: ctx.contactoLegal?.firstName ?? '',
        ApellidosCliente: ctx.contactoLegal?.lastName ?? '',
        DocIdentCliente: ctx.contactoLegal?.docIdentificacion ?? '',
        DirecUbiComodato: ctx.direccion?.direction ?? '',
        '#HREF_UrlCotizacion': ctx.quote?.hsQuoteLink ?? '',
      };

      for (let i = 0; i < 6; i++) {
        const c = ctx.capex?.[i];
        const slot = i + 1;
        tabs[`QrCpx${slot}`] = c?.qrCapex ?? '';
        tabs[`NombreCpx${slot}`] = c?.nombre ?? '';
        tabs[`CantidadCpx${slot}`] = c?.cantidad ?? '';
        tabs[`CostoCpx${slot}`] = c?.costoNeto ?? '';
      }

      return tabs;
    },
  };
}
