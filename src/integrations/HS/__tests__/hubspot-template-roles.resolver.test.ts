import { describe, expect, jest, test } from '@jest/globals';
import { createHubSpotTemplateRolesResolver } from '../hubspot-template-roles.resolver.js';
import type { HubSpotAdapter, ParametrosDc } from '../hubspot.adapter.js';

const row: ParametrosDc = {
  recordId: '61130817187',
  pais: 'Guatemala IV',
  templateId: 'tpl-gt-iv',
  legalRepresentativeCode: '127296968585',
  cmIdHubspotCode: '227829453070',
  usuarioLegal: '228008555346',
};

function makeResolver(result: ParametrosDc | null) {
  const getParametrosDcByTemplate = jest
    .fn<HubSpotAdapter['getParametrosDcByTemplate']>()
    .mockResolvedValue(result);
  const hubspot = { getParametrosDcByTemplate } as unknown as HubSpotAdapter;
  return { resolver: createHubSpotTemplateRolesResolver({ hubspot }), getParametrosDcByTemplate };
}

describe('createHubSpotTemplateRolesResolver', () => {
  test('mapea la fila de "Parametros DC" a la config de firmantes', async () => {
    const { resolver, getParametrosDcByTemplate } = makeResolver(row);

    await expect(resolver.getConfig('tpl-gt-iv')).resolves.toEqual({
      recordId: '61130817187',
      country: 'Guatemala',
      rawCountry: 'Guatemala IV',
      proveedorContactId: '127296968585',
      cmContactId: '227829453070',
      legalContactId: '228008555346',
    });
    expect(getParametrosDcByTemplate).toHaveBeenCalledWith('tpl-gt-iv');
  });

  test('normaliza "Guatemala QST" a "Guatemala" y deja el crudo en rawCountry', async () => {
    const { resolver } = makeResolver({ ...row, pais: 'Guatemala QST' });
    const config = await resolver.getConfig('tpl-gt-qst');
    expect(config?.country).toBe('Guatemala');
    expect(config?.rawCountry).toBe('Guatemala QST');
  });

  test('deja intactos los países sin alias', async () => {
    const { resolver } = makeResolver({ ...row, pais: 'Costa Rica' });
    await expect(resolver.getConfig('tpl-cr')).resolves.toMatchObject({
      country: 'Costa Rica',
      rawCountry: 'Costa Rica',
    });
  });

  test('devuelve undefined cuando no hay fila para el template', async () => {
    const { resolver } = makeResolver(null);
    await expect(resolver.getConfig('tpl-huerfano')).resolves.toBeUndefined();
  });

  test('propaga contactIds vacíos — la validación es del service', async () => {
    const { resolver } = makeResolver({ ...row, cmIdHubspotCode: '', usuarioLegal: '' });
    await expect(resolver.getConfig('tpl-gt-iv')).resolves.toMatchObject({
      cmContactId: '',
      legalContactId: '',
    });
  });
});
