/**
 * Resolution context handed to the resolver to compute prefill values for the
 * Propietario role tabs. All IO happens upstream in the service — the resolver
 * is sync and pure.
 */
export interface ResolutionCompany {
  razonSocial: string;
  pais: string;
}

export interface ResolutionContactoLegal {
  firstName: string;
  lastName: string;
  docIdentificacion: string;
}

export interface ResolutionCapex {
  qrCapex: string;
  nombre: string;
  cantidad: string;
  costoNeto: string;
}

export interface ResolutionDireccion {
  direction: string;
}

export interface ResolutionQuote {
  hsQuoteLink: string;
}

export interface ResolutionContext {
  templateId: string;
  company: ResolutionCompany;
  contactoLegal: ResolutionContactoLegal;
  capex: ResolutionCapex[];
  direccion: ResolutionDireccion | null;
  quote: ResolutionQuote;
}

/**
 * Port: returns the dictionary { tabLabel: value } that the DocuSign adapter
 * will inject as textTabs on the Propietario role.
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
