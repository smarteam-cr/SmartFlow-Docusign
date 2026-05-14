export interface TemplateRolesResolver {
  getProveedorContactId(templateId: string): string | undefined;
}
