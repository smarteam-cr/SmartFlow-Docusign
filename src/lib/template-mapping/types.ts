/**
 * Subset of HubSpot contact fields that the envelope flow needs.
 * Defined here (not in HubSpot adapter) because the resolver is the consumer
 * and shouldn't depend on integration-layer types.
 */
export interface ContactInfo {
  firstName: string;
  lastName: string;
  email: string;
}

/**
 * Context handed to the resolver to compute prefill values.
 * Today only `templateId` and `contact`. Future: `deal`, `tenantId`, etc.
 */
export interface MappingContext {
  templateId: string;
  contact: ContactInfo;
}

/**
 * Port: returns a dictionary { tabLabel: value } that the DocuSign adapter
 * will inject into the envelope's textTabs.
 *
 * Demo implementation hardcodes Nombre/Apellido. Production will read mappings
 * from Mongo per tenant (Roadmap §15.2).
 *
 * Note: synchronous in demo because the static resolver doesn't do I/O.
 * The Mongo implementation will be async — the service contract should
 * `await` to be forward-compatible.
 */
export interface TemplateMappingResolver {
  resolveTabValues(ctx: MappingContext): Record<string, string> | Promise<Record<string, string>>;
}
