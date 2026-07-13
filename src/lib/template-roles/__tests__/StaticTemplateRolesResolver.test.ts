import { describe, expect, test } from '@jest/globals';
import { createStaticTemplateRolesResolver } from '../StaticTemplateRolesResolver.js';

const TPL_ID = '82c6188c-f743-4bba-a762-49ae72d9aafe';
const CONTACT_ID = 'hs-contact-proveedor-1';

const VALID_MAP = [
  { id: TPL_ID, country: 'España', legalRepresentativeCode: CONTACT_ID },
  { id: 'tpl-otro', country: 'Salvador', legalRepresentativeCode: 'hs-contact-proveedor-2' },
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
});
