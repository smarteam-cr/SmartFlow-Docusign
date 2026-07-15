import type { TeamCountryMap, TeamCountryResolver } from './types.js';

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

/** Uppercase + trim + sin tildes, para comparar con tolerancia. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

export function createStaticTeamCountryResolver(
  map: TeamCountryMap = TEAM_COUNTRY_MAP
): TeamCountryResolver {
  const teamToCode = new Map<string, string>();
  for (const [code, teams] of Object.entries(map)) {
    for (const team of teams) {
      teamToCode.set(normalize(team), code);
    }
  }

  return {
    resolveCountryCode(teamName: string): string | null {
      return teamToCode.get(normalize(teamName)) ?? null;
    },
  };
}
