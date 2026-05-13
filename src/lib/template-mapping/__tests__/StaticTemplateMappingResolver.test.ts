import { describe, expect, test } from '@jest/globals';
import { createStaticTemplateMappingResolver } from '../StaticTemplateMappingResolver.js';
import type { MappingContext } from '../types.js';

const baseCtx: MappingContext = {
  templateId: 'tpl-1',
  contact: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@math.org' },
  contactDetails: { identification: 'CC-12345', country: 'Colombia' },
  company: { name: 'ACME Inc', country: 'Colombia', address: 'Calle 100 #5-30' },
  lineItem: { name: 'Producto X', sku: 'SKU-001', price: '1000' },
  dealCurrencyCode: 'USD',
};

describe('createStaticTemplateMappingResolver', () => {
  const resolver = createStaticTemplateMappingResolver();

  test('maps contact firstName to "Nombre" tabLabel', async () => {
    const result = await resolver.resolveTabValues(baseCtx);
    expect(result.Nombre).toBe('Ada');
  });

  test('maps contact lastName to "Apellido" tabLabel', async () => {
    const result = await resolver.resolveTabValues(baseCtx);
    expect(result.Apellido).toBe('Lovelace');
  });

  test('returns exactly the 11 expected keys', async () => {
    const result = await resolver.resolveTabValues(baseCtx);
    expect(Object.keys(result).sort()).toEqual([
      'Apellido',
      'DireccionEmpresaComodatario',
      'EmpresaComodatario',
      'Moneda',
      'NombreProducto',
      'NumeroIdentificacionComodatario',
      'PaisContactoComodatario',
      'PaisEmpresaComodatario',
      'PrecioProducto',
      'SkuProducto',
      'Nombre',
    ].sort());
  });

  test('does not depend on templateId in demo (same output for any template)', async () => {
    const a = await resolver.resolveTabValues(baseCtx);
    const b = await resolver.resolveTabValues({ ...baseCtx, templateId: 'tpl-DIFFERENT' });
    expect(a).toEqual(b);
  });

  test('tolera campos vacíos en el contexto (no lanza, devuelve strings vacíos)', async () => {
    const sparseCtx: MappingContext = {
      templateId: 'tpl-1',
      contact: { firstName: '', lastName: '', email: 'a@b.cr' },
      contactDetails: { identification: '', country: '' },
      company: { name: '', country: '', address: '' },
      lineItem: { name: '', sku: '', price: '' },
      dealCurrencyCode: '',
    };

    const result = await resolver.resolveTabValues(sparseCtx);

    expect(result.Nombre).toBe('');
    expect(result.Apellido).toBe('');
    expect(result.NumeroIdentificacionComodatario).toBe('');
    expect(result.PaisContactoComodatario).toBe('');
    expect(result.EmpresaComodatario).toBe('');
    expect(result.PaisEmpresaComodatario).toBe('');
    expect(result.DireccionEmpresaComodatario).toBe('');
    expect(result.NombreProducto).toBe('');
    expect(result.SkuProducto).toBe('');
    expect(result.PrecioProducto).toBe('');
    expect(result.Moneda).toBe('');
  });

  test('convierte undefined a string vacío (defensa forward-compat)', async () => {
    // Forzamos undefined con type-bypass para simular comportamiento de adapters futuros
    // que podrían no garantizar string en todas las propiedades.
    const undefinedCtx = {
      templateId: 'tpl-1',
      contact: { firstName: undefined, lastName: undefined, email: 'a@b.cr' },
      contactDetails: { identification: undefined, country: undefined },
      company: { name: undefined, country: undefined, address: undefined },
      lineItem: { name: undefined, sku: undefined, price: undefined },
      dealCurrencyCode: undefined,
    } as unknown as MappingContext;

    const result = await resolver.resolveTabValues(undefinedCtx);

    // Cada valor debe ser '' literal — nunca undefined, nunca null.
    for (const value of Object.values(result)) {
      expect(value).toBe('');
    }
  });
});
