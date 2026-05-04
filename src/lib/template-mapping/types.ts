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

/** Extended contact properties (PII — kept off the listing endpoint). */
export interface ContactDetailsInfo {
  identification: string;
  country: string;
}

/** Company fields that the envelope flow needs. */
export interface CompanyInfo {
  name: string;
  country: string;
  address: string;
}

/** Line item fields that the envelope flow needs. */
export interface LineItemInfo {
  name: string;
  sku: string;
  price: string;
}

/**
 * Context handed to the resolver to compute prefill values.
 * Today: contact, company, lineItem and currency. Future: tenantId, locale, etc.
 */
export interface MappingContext {
  templateId: string;
  contact: ContactInfo;
  contactDetails: ContactDetailsInfo;
  company: CompanyInfo;
  lineItem: LineItemInfo;
  dealCurrencyCode: string;
}

/**
 * Port: returns a dictionary { tabLabel: value } that the DocuSign adapter
 * will inject into the envelope's textTabs.
 *
 * Demo implementation hardcodes the 11 tabLabels. Production will read
 * mappings from Mongo per tenant (Roadmap §15.2).
 *
 * Note: synchronous in demo because the static resolver doesn't do I/O.
 * The Mongo implementation will be async — the service contract should
 * `await` to be forward-compatible.
 */
export interface TemplateMappingResolver {
  resolveTabValues(ctx: MappingContext): Record<string, string> | Promise<Record<string, string>>;
}
