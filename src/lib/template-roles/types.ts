/**
 * Configuración de los firmantes fijos de un template DocuSign. Vive en el
 * objeto personalizado "Parametros DC" de HubSpot (una fila por template).
 *
 * Los tres contactId pueden venir vacíos si la fila está a medio llenar; el
 * service es quien decide que eso es un error (LEGAL/CM/PROVEEDOR_NOT_CONFIGURED).
 */
export interface TemplateRolesConfig {
  /** hs_object_id de la fila en "Parametros DC" (para logs y mensajes de error). */
  recordId: string;
  /**
   * País del proveedor ya normalizado — alimenta el tab countryINVE.
   * "Guatemala IV"/"Guatemala QST" se colapsan a "Guatemala".
   */
  country: string;
  /** Valor crudo de la propiedad `pais`, sin normalizar (para diagnóstico). */
  rawCountry: string;
  /** HubSpot contactId del representante legal del Proveedor. */
  proveedorContactId: string;
  /** HubSpot contactId del CM. */
  cmContactId: string;
  /** HubSpot contactId del usuario Legal. */
  legalContactId: string;
}

/**
 * Port: fuente de la configuración de firmantes por template.
 *
 * Devuelve `undefined` cuando no hay fila para ese templateId. La
 * implementación de producción lee HubSpot, así que es asíncrona.
 */
export interface TemplateRolesResolver {
  getConfig(templateId: string): Promise<TemplateRolesConfig | undefined>;
}
