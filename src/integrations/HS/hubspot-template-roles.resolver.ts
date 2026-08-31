import { normalizeCountryName } from '../../lib/team-country/index.js';
import type {
  TemplateRolesConfig,
  TemplateRolesResolver,
} from '../../lib/template-roles/index.js';
import type { HubSpotAdapter } from './hubspot.adapter.js';

/**
 * Implementación del port TemplateRolesResolver respaldada por el objeto
 * personalizado "Parametros DC" de HubSpot.
 *
 * Sustituye a la vieja variable de entorno TEMPLATE_PROVEEDOR_MAP: la
 * configuración de firmantes ahora la edita el cliente desde el CRM, así que
 * cada envío la lee en vivo (sin caché — un cambio en HubSpot aplica al
 * siguiente envío, salvo el retardo del índice de búsqueda de HubSpot).
 */
export function createHubSpotTemplateRolesResolver(deps: {
  hubspot: HubSpotAdapter;
}): TemplateRolesResolver {
  return {
    async getConfig(templateId: string): Promise<TemplateRolesConfig | undefined> {
      const row = await deps.hubspot.getParametrosDcByTemplate(templateId);
      if (!row) return undefined;

      return {
        recordId: row.recordId,
        // "Guatemala IV" / "Guatemala QST" → "Guatemala" antes de imprimirlo
        // en el tab countryINVE del documento.
        country: normalizeCountryName(row.pais),
        rawCountry: row.pais,
        proveedorContactId: row.legalRepresentativeCode,
        cmContactId: row.cmIdHubspotCode,
        legalContactId: row.usuarioLegal,
      };
    },
  };
}
