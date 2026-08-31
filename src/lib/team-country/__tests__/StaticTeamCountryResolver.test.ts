import { describe, expect, test } from '@jest/globals';
import {
  createStaticTeamCountryResolver,
  normalizeCountryName,
  TEAM_COUNTRY_MAP,
} from '../StaticTeamCountryResolver.js';

describe('createStaticTeamCountryResolver', () => {
  const resolver = createStaticTeamCountryResolver();

  test('resuelve el código para cada equipo del mapa por defecto', () => {
    expect(resolver.resolveCountryCode('Costa Rica')).toBe('CR');
    expect(resolver.resolveCountryCode('Guatemala')).toBe('GT');
    expect(resolver.resolveCountryCode('Belice')).toBe('GT');
    expect(resolver.resolveCountryCode('Honduras')).toBe('HN');
    expect(resolver.resolveCountryCode('El Salvador')).toBe('SV');
    expect(resolver.resolveCountryCode('Republica Dominicana')).toBe('RD');
  });

  test('no distingue mayúsculas/minúsculas', () => {
    expect(resolver.resolveCountryCode('COSTA RICA')).toBe('CR');
    expect(resolver.resolveCountryCode('costa rica')).toBe('CR');
  });

  test('no distingue tildes', () => {
    expect(resolver.resolveCountryCode('República Dominicana')).toBe('RD');
  });

  test('tolera espacios alrededor', () => {
    expect(resolver.resolveCountryCode('  Costa Rica  ')).toBe('CR');
  });

  test('equipo no mapeado → null', () => {
    expect(resolver.resolveCountryCode('Panamá')).toBeNull();
    expect(resolver.resolveCountryCode('')).toBeNull();
  });

  test('acepta un mapa custom', () => {
    const custom = createStaticTeamCountryResolver({ PA: ['PANAMA'] });
    expect(custom.resolveCountryCode('Panamá')).toBe('PA');
    expect(custom.resolveCountryCode('Costa Rica')).toBeNull();
  });

  test('el mapa por defecto tiene los 5 códigos esperados', () => {
    expect(Object.keys(TEAM_COUNTRY_MAP).sort()).toEqual(['CR', 'GT', 'HN', 'RD', 'SV']);
  });

  describe('resolveCountryFullName', () => {
    test('resuelve el nombre completo para cada código', () => {
      expect(resolver.resolveCountryFullName('CR')).toBe('Costa Rica');
      expect(resolver.resolveCountryFullName('GT')).toBe('Guatemala');
      expect(resolver.resolveCountryFullName('HN')).toBe('Honduras');
      expect(resolver.resolveCountryFullName('SV')).toBe('El Salvador');
      expect(resolver.resolveCountryFullName('RD')).toBe('Republica Dominicana');
    });

    test('no distingue mayúsculas ni espacios en el código', () => {
      expect(resolver.resolveCountryFullName('cr')).toBe('Costa Rica');
      expect(resolver.resolveCountryFullName(' CR ')).toBe('Costa Rica');
    });

    test('código no mapeado → null', () => {
      expect(resolver.resolveCountryFullName('PA')).toBeNull();
      expect(resolver.resolveCountryFullName('')).toBeNull();
    });
  });
});

describe('normalizeCountryName', () => {
  test('colapsa los desdobles de Guatemala del objeto "Parametros DC"', () => {
    expect(normalizeCountryName('Guatemala IV')).toBe('Guatemala');
    expect(normalizeCountryName('Guatemala QST')).toBe('Guatemala');
  });

  test('compara sin distinguir mayúsculas ni espacios sobrantes', () => {
    expect(normalizeCountryName('  guatemala qst  ')).toBe('Guatemala');
  });

  test('devuelve el valor tal cual cuando no hay alias', () => {
    expect(normalizeCountryName('Costa Rica')).toBe('Costa Rica');
    expect(normalizeCountryName('Republica Dominicana')).toBe('Republica Dominicana');
  });

  test('string vacío devuelve string vacío', () => {
    expect(normalizeCountryName('   ')).toBe('');
  });

  test('acepta un mapa de alias propio', () => {
    expect(normalizeCountryName('Panamá Norte', { 'PANAMA NORTE': 'Panamá' })).toBe('Panamá');
  });
});
