import { describe, expect, test } from '@jest/globals';
import { createStaticTemplateMappingResolver } from '../StaticTemplateMappingResolver.js';

describe('createStaticTemplateMappingResolver', () => {
  const resolver = createStaticTemplateMappingResolver();

  test('maps firstName to "Nombre" tabLabel', async () => {
    const result = await resolver.resolveTabValues({
      templateId: 'tpl-1',
      contact: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@math.org' },
    });
    expect(result.Nombre).toBe('Ada');
  });

  test('maps lastName to "Apellido" tabLabel', async () => {
    const result = await resolver.resolveTabValues({
      templateId: 'tpl-1',
      contact: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@math.org' },
    });
    expect(result.Apellido).toBe('Lovelace');
  });

  test('returns exactly Nombre and Apellido keys (no extras)', async () => {
    const result = await resolver.resolveTabValues({
      templateId: 'tpl-1',
      contact: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@math.org' },
    });
    expect(Object.keys(result).sort()).toEqual(['Apellido', 'Nombre']);
  });

  test('does not depend on templateId in demo (same output for any template)', async () => {
    const a = await resolver.resolveTabValues({
      templateId: 'tpl-1',
      contact: { firstName: 'A', lastName: 'B', email: 'a@b.com' },
    });
    const b = await resolver.resolveTabValues({
      templateId: 'tpl-DIFFERENT',
      contact: { firstName: 'A', lastName: 'B', email: 'a@b.com' },
    });
    expect(a).toEqual(b);
  });
});
