import { describe, expect, test } from '@jest/globals';
import { createStaticTemplateRolesResolver } from '../StaticTemplateRolesResolver.js';

const TPL_ID = '82c6188c-f743-4bba-a762-49ae72d9aafe';
const CONTACT_ID = 'hs-contact-proveedor-1';
const CM_ID = 'hs-contact-cm-1';

const VALID_MAP = [
  { id: TPL_ID, country: 'España', legalRepresentativeCode: CONTACT_ID, cmIdHubspotCode: CM_ID },
  {
    id: 'tpl-otro',
    country: 'Salvador',
    legalRepresentativeCode: 'hs-contact-proveedor-2',
    cmIdHubspotCode: 'hs-contact-cm-2',
  },
];

describe('StaticTemplateRolesResolver', () => {
  test('devuelve contactId y country configurados para el template', () => {
    const resolver = createStaticTemplateRolesResolver(JSON.stringify(VALID_MAP));
    expect(resolver.getProveedorConfig(TPL_ID)).toEqual({
      contactId: CONTACT_ID,
      country: 'España',
    });
    expect(resolver.getProveedorConfig('tpl-otro')).toEqual({
      contactId: 'hs-contact-proveedor-2',
      country: 'Salvador',
    });
  });

  test('devuelve undefined para template no configurado', () => {
    const resolver = createStaticTemplateRolesResolver(JSON.stringify([]));
    expect(resolver.getProveedorConfig('any-template')).toBeUndefined();
  });

  test('lanza al construir si el JSON es inválido', () => {
    expect(() => createStaticTemplateRolesResolver('not-json')).toThrow();
  });

  test('lanza al construir si el JSON no es array de { id, country, legalRepresentativeCode }', () => {
    expect(() => createStaticTemplateRolesResolver(JSON.stringify({ tpl: 'contact' }))).toThrow();
    expect(() => createStaticTemplateRolesResolver(JSON.stringify([{ id: 'tpl' }]))).toThrow();
    expect(() =>
      createStaticTemplateRolesResolver(
        JSON.stringify([{ id: 'tpl', country: 123, legalRepresentativeCode: 'c' }])
      )
    ).toThrow();
    expect(() => createStaticTemplateRolesResolver(JSON.stringify('no-es-array'))).toThrow();
  });

  describe('getCmConfig', () => {
    test('devuelve el contactId del cmIdHubspotCode configurado', () => {
      const resolver = createStaticTemplateRolesResolver(JSON.stringify(VALID_MAP));
      expect(resolver.getCmConfig(TPL_ID)).toEqual({ contactId: CM_ID });
      expect(resolver.getCmConfig('tpl-otro')).toEqual({ contactId: 'hs-contact-cm-2' });
    });

    test('devuelve undefined para template no configurado', () => {
      const resolver = createStaticTemplateRolesResolver(JSON.stringify([]));
      expect(resolver.getCmConfig('any-template')).toBeUndefined();
    });

    test('devuelve undefined si cmIdHubspotCode está vacío o en blanco', () => {
      const resolver = createStaticTemplateRolesResolver(
        JSON.stringify([
          { id: 'tpl-vacio', country: 'CR', legalRepresentativeCode: 'p-1', cmIdHubspotCode: '' },
          { id: 'tpl-blank', country: 'CR', legalRepresentativeCode: 'p-1', cmIdHubspotCode: '  ' },
        ])
      );
      expect(resolver.getCmConfig('tpl-vacio')).toBeUndefined();
      expect(resolver.getCmConfig('tpl-blank')).toBeUndefined();
    });

    test('devuelve undefined si falta la key (.env legacy) sin romper el proveedor', () => {
      const resolver = createStaticTemplateRolesResolver(
        JSON.stringify([{ id: 'tpl-legacy', country: 'CR', legalRepresentativeCode: 'p-1' }])
      );
      expect(resolver.getCmConfig('tpl-legacy')).toBeUndefined();
      expect(resolver.getProveedorConfig('tpl-legacy')).toEqual({
        contactId: 'p-1',
        country: 'CR',
      });
    });

    test('lanza al construir si cmIdHubspotCode no es string', () => {
      expect(() =>
        createStaticTemplateRolesResolver(
          JSON.stringify([
            { id: 'tpl', country: 'CR', legalRepresentativeCode: 'p-1', cmIdHubspotCode: 123 },
          ])
        )
      ).toThrow();
    });
  });
});
