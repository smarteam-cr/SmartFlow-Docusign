import { describe, expect, test } from '@jest/globals';
import { createStaticTemplateRolesResolver } from '../StaticTemplateRolesResolver.js';

const TPL_ID = '82c6188c-f743-4bba-a762-49ae72d9aafe';
const CONTACT_ID = 'hs-contact-proveedor-1';

describe('StaticTemplateRolesResolver', () => {
  test('devuelve el contactId configurado para el template', () => {
    const resolver = createStaticTemplateRolesResolver(
      JSON.stringify({ [TPL_ID]: CONTACT_ID })
    );
    expect(resolver.getProveedorContactId(TPL_ID)).toBe(CONTACT_ID);
  });

  test('devuelve undefined para template no configurado', () => {
    const resolver = createStaticTemplateRolesResolver(JSON.stringify({}));
    expect(resolver.getProveedorContactId('any-template')).toBeUndefined();
  });

  test('lanza al construir si el JSON es inválido', () => {
    expect(() => createStaticTemplateRolesResolver('not-json')).toThrow();
  });
});
