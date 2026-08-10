export interface ProveedorTemplateConfig {
  /** HubSpot contactId del representante legal del Proveedor. */
  contactId: string;
  /** País del proveedor (tab countryINVE en el template DocuSign). */
  country: string;
}

export interface CmTemplateConfig {
  /** HubSpot contactId (hs_object_id) del CM que firma primero. */
  contactId: string;
}

export interface TemplateRolesResolver {
  getProveedorConfig(templateId: string): ProveedorTemplateConfig | undefined;
  /**
   * Config del rol CM. `undefined` si el template no está mapeado o si
   * `cmIdHubspotCode` viene vacío — el service lo traduce a CM_NOT_CONFIGURED.
   */
  getCmConfig(templateId: string): CmTemplateConfig | undefined;
}
