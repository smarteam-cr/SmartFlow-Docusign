import type { CountryFullNameMap, TeamCountryMap, TeamCountryResolver } from './types.js';

/**
 * Configuración editable: agrega aquí nuevos equipos o códigos de país.
 * Los nombres de equipo se comparan sin distinguir mayúsculas ni tildes,
 * así que "Costa Rica" y "COSTA RICA" hacen match igual.
 */
export const TEAM_COUNTRY_MAP: TeamCountryMap = {
  GT: ['GUATEMALA', 'BELICE'],
  CR: ['COSTA RICA'],
  HN: ['HONDURAS'],
  SV: ['EL SALVADOR'],
  RD: ['REPUBLICA DOMINICANA'],
};

/**
 * Configuración editable: nombre completo (para mostrar) de cada código de
 * país. Usado para el campo fullLocation del send-context.
 */
export const COUNTRY_FULL_NAME_MAP: CountryFullNameMap = {
  GT: 'Guatemala',
  CR: 'Costa Rica',
  HN: 'Honduras',
  SV: 'El Salvador',
  RD: 'Republica Dominicana',
};

/** Uppercase + trim + sin tildes, para comparar con tolerancia. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

export function createStaticTeamCountryResolver(
  map: TeamCountryMap = TEAM_COUNTRY_MAP,
  fullNames: CountryFullNameMap = COUNTRY_FULL_NAME_MAP
): TeamCountryResolver {
  const teamToCode = new Map<string, string>();
  for (const [code, teams] of Object.entries(map)) {
    for (const team of teams) {
      teamToCode.set(normalize(team), code);
    }
  }

  const codeToFullName = new Map<string, string>();
  for (const [code, fullName] of Object.entries(fullNames)) {
    codeToFullName.set(normalize(code), fullName);
  }

  return {
    resolveCountryCode(teamName: string): string | null {
      return teamToCode.get(normalize(teamName)) ?? null;
    },
    resolveCountryFullName(code: string): string | null {
      return codeToFullName.get(normalize(code)) ?? null;
    },
  };
}
