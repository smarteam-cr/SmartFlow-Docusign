export type {
  HubSpotAdapter,
  HubSpotAdapterConfig,
  Contact,
  Company,
  DealOwner,
  Capex,
  Direccion,
  Quote,
  ParametrosDc,
} from './hubspot.adapter.js';
export { createHubSpotAdapter } from './hubspot.adapter.js';

export type {
  HubSpotFilesAdapter,
  HubSpotFilesAdapterConfig,
} from './hubspot-files.adapter.js';
export { createHubSpotFilesAdapter } from './hubspot-files.adapter.js';

export { createHubSpotTemplateRolesResolver } from './hubspot-template-roles.resolver.js';
