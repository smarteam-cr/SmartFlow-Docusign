export interface ProveedorTemplateConfig {
  /** HubSpot contactId del representante legal del Proveedor. */
  contactId: string;
  /** País del proveedor (tab countryINVE en el template DocuSign). */
  country: string;
}

export interface TemplateRolesResolver {
  getProveedorConfig(templateId: string): ProveedorTemplateConfig | undefined;
}
