/**
 * Resolution context handed to the resolver to compute prefill values for the
 * Proveedor role tabs. All IO happens upstream in the service — the resolver
 * is sync and pure.
 */
export interface ResolutionCompany {
  razonSocial: string;
  pais: string;
}

export interface ResolutionContactoLegal {
  /** Nombre completo del representante legal (HubSpot o request body). */
  fullName: string;
  /** DNI del representante legal (HubSpot o request body). */
  dni: string;
  /** País de origen del cliente (propiedad country del contacto HubSpot). */
  pais: string;
}

export interface ResolutionCapex {
  codigo_qr: string;
  nombre: string;
  cantidad: string;
  costoNeto: string;
}

export interface ResolutionQuote {
  hsQuoteLink: string;
}

export interface ResolutionContext {
  templateId: string;
  company: ResolutionCompany;
  contactoLegal: ResolutionContactoLegal;
  /** País del proveedor según TEMPLATE_PROVEEDOR_MAP (tab countryINVE). */
  proveedorCountry: string;
  /** Ubicación del cliente, viene tal cual del request body. */
  location: string;
  /** Acuerdo comercial, viene tal cual del request body (tab Commercial_Agreement). */
  commercialAgreement: string;
  /** Dirección fiscal de la empresa, viene tal cual del request body (tab direccionFiscal). */
  direccionFiscal: string;
  /** Uso exclusivo, viene tal cual del request body (tab exclusiveUse). */
  exclusiveUse: string;
  /** Fecha de envío en formato DD/MM/YYYY (tab datetime del template). */
  sentDate: string;
  capex: ResolutionCapex[];
  quote: ResolutionQuote;
}

/**
 * Port: returns the dictionary { tabLabel: value } that the DocuSign adapter
 * will inject as textTabs on the Proveedor role.
 *
 * Synchronous: all IO happens in the envelope service. The resolver is pure.
 *
 * Tolerancia field-level (spec v2 §11): any missing/empty source produces
 * an empty string. Never throws on missing data — structural validations
 * are the service's job.
 */
export interface TemplateMappingResolver {
  resolveTabValues(ctx: ResolutionContext): Record<string, string>;
}
