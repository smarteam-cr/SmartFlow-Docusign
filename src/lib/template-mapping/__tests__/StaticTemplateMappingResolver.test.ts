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
});
