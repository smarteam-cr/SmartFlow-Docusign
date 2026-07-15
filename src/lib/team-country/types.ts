/**
 * Mapa código de país → nombres de equipo de HubSpot que le corresponden.
 * El código es el prefijo con el que se nombran los templates en DocuSign
 * (ej. "CR - Acuerdo comercial...").
 */
export type TeamCountryMap = Record<string, string[]>;

/** Mapa código de país → nombre completo para mostrar ("CR" → "Costa Rica"). */
export type CountryFullNameMap = Record<string, string>;

/**
 * Port: resuelve el código de país ("CR", "GT", ...) a partir del nombre de
 * equipo de HubSpot ("Costa Rica", "Guatemala", ...), y el nombre completo
 * del país a partir del código. Devuelve null si no hay mapeo.
 */
export interface TeamCountryResolver {
  resolveCountryCode(teamName: string): string | null;
  resolveCountryFullName(code: string): string | null;
}
