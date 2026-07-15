import { describe, expect, test } from '@jest/globals';
import {
  createStaticTeamCountryResolver,
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
});
