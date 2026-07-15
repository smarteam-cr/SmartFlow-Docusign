import { describe, expect, jest, test } from '@jest/globals';
import {
  createEnvelopeLifecycleService,
  type EnvelopeEvent,
  type EnvelopeLifecycleDeps,
} from '../envelope-lifecycle.service.js';
import type { HubSpotAdapter } from '../../integrations/HS/hubspot.adapter.js';
import type { HubSpotFilesAdapter } from '../../integrations/HS/hubspot-files.adapter.js';
import type { DocusignAdapter } from '../../integrations/Docusign/index.js';

function makeFakeDeps(overrides?: Partial<EnvelopeLifecycleDeps>): EnvelopeLifecycleDeps {
  return {
    hubspot: {
      updateDealProperties: jest.fn<HubSpotAdapter['updateDealProperties']>().mockResolvedValue(undefined),
      createNoteForDeal: jest.fn<HubSpotAdapter['createNoteForDeal']>().mockResolvedValue({ noteId: 'n-1' }),
      getDealContacts: jest.fn<HubSpotAdapter['getDealContacts']>().mockResolvedValue([]),
      getDealOwner: jest.fn<HubSpotAdapter['getDealOwner']>().mockResolvedValue({ id: '', name: '', email: '' }),
      getContactById: jest.fn<HubSpotAdapter['getContactById']>().mockResolvedValue({ id: '', firstName: '', lastName: '', email: '', docIdentificacion: '', pais: '' }),
      findJuridicoContactIds: jest.fn<HubSpotAdapter['findJuridicoContactIds']>().mockResolvedValue([]),
      getDealPrimaryCompany: jest.fn<HubSpotAdapter['getDealPrimaryCompany']>().mockResolvedValue({ id: '', razonSocial: '', pais: '', direccionFiscal: '' }),
      getDealCapex: jest.fn<HubSpotAdapter['getDealCapex']>().mockResolvedValue([]),
      getCompanyDirecciones: jest.fn<HubSpotAdapter['getCompanyDirecciones']>().mockResolvedValue([]),
      getDealLatestQuote: jest.fn<HubSpotAdapter['getDealLatestQuote']>().mockResolvedValue({ id: '', hsQuoteLink: '' }),
      getDealProperties: jest.fn<HubSpotAdapter['getDealProperties']>().mockResolvedValue({}),
    },
    hubspotFiles: {
      uploadFile: jest.fn<HubSpotFilesAdapter['uploadFile']>().mockResolvedValue({ fileId: 'f-1', url: 'https://files.hubspot.com/f-1' }),
      findFileByName: jest.fn<HubSpotFilesAdapter['findFileByName']>().mockResolvedValue(null),
    },
    docusign: {
      listTemplates: jest.fn<DocusignAdapter['listTemplates']>().mockResolvedValue([]),
      sendEnvelopeFromTemplate: jest.fn<DocusignAdapter['sendEnvelopeFromTemplate']>().mockResolvedValue({ envelopeId: '', status: '' }),
      downloadCombinedDocument: jest.fn<DocusignAdapter['downloadCombinedDocument']>().mockResolvedValue(Buffer.from('pdf')),
      getEnvelopeStatus: jest.fn<DocusignAdapter['getEnvelopeStatus']>().mockResolvedValue('sent'),
      voidEnvelope: jest.fn<DocusignAdapter['voidEnvelope']>().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

function baseEvent(overrides?: Partial<EnvelopeEvent>): EnvelopeEvent {
  return {
    eventType: 'envelope-completed',
    envelopeId: 'env-001',
    dealId: 'd-1',
    portalId: 'p-1',
    ...overrides,
  };
}

describe('EnvelopeLifecycleService.handleEvent — completed', () => {
  test('happy path: download → upload → deal update → note with attachment', async () => {
    const deps = makeFakeDeps();
    const service = createEnvelopeLifecycleService(deps);
    await service.handleEvent(baseEvent());

    expect(deps.docusign.downloadCombinedDocument).toHaveBeenCalledWith('env-001');
    expect(deps.hubspotFiles.findFileByName).toHaveBeenCalledWith('deal-d-1-env-001.pdf');
    expect(deps.hubspotFiles.uploadFile).toHaveBeenCalledWith({
      filename: 'deal-d-1-env-001.pdf',
      buffer: expect.any(Buffer),
      access: 'PRIVATE',
    });
    expect(deps.hubspot.updateDealProperties).toHaveBeenCalledWith('d-1', expect.objectContaining({
      docusign_latest_status: 'signed',
      docusign_latest_pdf_url: expect.stringContaining('f-1'),
    }));
    expect(deps.hubspot.createNoteForDeal).toHaveBeenCalledWith(expect.objectContaining({
      dealId: 'd-1',
      attachmentIds: ['f-1'],
    }));
  });

  test('idempotent: skips when file already exists', async () => {
    const deps = makeFakeDeps();
    (deps.hubspotFiles.findFileByName as jest.Mock<() => Promise<{ fileId: string } | null>>).mockResolvedValue({ fileId: 'existing-f' });
    const service = createEnvelopeLifecycleService(deps);
    await service.handleEvent(baseEvent());

    expect(deps.docusign.downloadCombinedDocument).not.toHaveBeenCalled();
    expect(deps.hubspotFiles.uploadFile).not.toHaveBeenCalled();
    expect(deps.hubspot.updateDealProperties).not.toHaveBeenCalled();
  });

  test('skips when dealId is empty', async () => {
    const deps = makeFakeDeps();
    const service = createEnvelopeLifecycleService(deps);
    await service.handleEvent(baseEvent({ dealId: '' }));

    expect(deps.docusign.downloadCombinedDocument).not.toHaveBeenCalled();
    expect(deps.hubspotFiles.uploadFile).not.toHaveBeenCalled();
  });
});

describe('EnvelopeLifecycleService.handleEvent — sent', () => {
  test('updates deal properties with status sent', async () => {
    const deps = makeFakeDeps();
    const service = createEnvelopeLifecycleService(deps);
    await service.handleEvent(baseEvent({ eventType: 'envelope-sent' }));

    expect(deps.hubspot.updateDealProperties).toHaveBeenCalledWith('d-1', {
      docusign_latest_status: 'sent',
    });
    expect(deps.hubspot.createNoteForDeal).not.toHaveBeenCalled();
  });
});

describe('EnvelopeLifecycleService.handleEvent — declined', () => {
  test('updates deal properties + creates note with reason', async () => {
    const deps = makeFakeDeps();
    const service = createEnvelopeLifecycleService(deps);
    await service.handleEvent(baseEvent({ eventType: 'envelope-declined', declinedReason: 'No estoy de acuerdo' }));

    expect(deps.hubspot.updateDealProperties).toHaveBeenCalledWith('d-1', {
      docusign_latest_status: 'declined',
    });
    expect(deps.hubspot.createNoteForDeal).toHaveBeenCalledWith(expect.objectContaining({
      dealId: 'd-1',
      body: expect.stringContaining('No estoy de acuerdo'),
    }));
  });
});

describe('EnvelopeLifecycleService.handleEvent — voided', () => {
  test('updates deal properties + creates note with reason', async () => {
    const deps = makeFakeDeps();
    const service = createEnvelopeLifecycleService(deps);
    await service.handleEvent(baseEvent({ eventType: 'envelope-voided', voidedReason: 'Error en datos' }));

    expect(deps.hubspot.updateDealProperties).toHaveBeenCalledWith('d-1', {
      docusign_latest_status: 'voided',
    });
    expect(deps.hubspot.createNoteForDeal).toHaveBeenCalledWith(expect.objectContaining({
      dealId: 'd-1',
      body: expect.stringContaining('Error en datos'),
    }));
  });
});

describe('EnvelopeLifecycleService.handleEvent — recipient-completed', () => {
  test('updates deal status to signing', async () => {
    const deps = makeFakeDeps();
    const service = createEnvelopeLifecycleService(deps);
    await service.handleEvent(baseEvent({ eventType: 'recipient-completed' }));

    expect(deps.hubspot.updateDealProperties).toHaveBeenCalledWith('d-1', {
      docusign_latest_status: 'signing',
    });
    expect(deps.hubspot.createNoteForDeal).not.toHaveBeenCalled();
  });
});

describe('EnvelopeLifecycleService.handleEvent — unknown event', () => {
  test('does nothing and does not throw', async () => {
    const deps = makeFakeDeps();
    const service = createEnvelopeLifecycleService(deps);
    await expect(service.handleEvent(baseEvent({ eventType: 'envelope-purge' }))).resolves.toBeUndefined();

    expect(deps.hubspot.updateDealProperties).not.toHaveBeenCalled();
    expect(deps.hubspot.createNoteForDeal).not.toHaveBeenCalled();
  });
});
