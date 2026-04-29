import type { Contact, HubSpotAdapter } from '../integrations/HS/index.js';

export interface ContactsService {
  /**
   * Returns all contacts associated to the Deal that have an email.
   * Returns an empty array if the Deal has no contacts (or none with email).
   * Throws NotFoundError(DEAL_NOT_FOUND) if the dealId does not exist.
   */
  listForDeal(dealId: string): Promise<Contact[]>;
}

export interface ContactsServiceDeps {
  hubspot: HubSpotAdapter;
}

export function createContactsService(deps: ContactsServiceDeps): ContactsService {
  return {
    listForDeal(dealId: string): Promise<Contact[]> {
      return deps.hubspot.getDealContacts(dealId);
    },
  };
}
