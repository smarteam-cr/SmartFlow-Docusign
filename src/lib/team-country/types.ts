/**
 * Mapa código de país → nombres de equipo de HubSpot que le corresponden.
 * El código es el prefijo con el que se nombran los templates en DocuSign
 * (ej. "CR - Acuerdo comercial...").
 */
export type TeamCountryMap = Record<string, string[]>;

/**
 * Port: resuelve el código de país ("CR", "GT", ...) a partir del nombre de
 * equipo de HubSpot ("Costa Rica", "Guatemala", ...). Devuelve null si el
 * equipo no está mapeado.
 */
export interface TeamCountryResolver {
  resolveCountryCode(teamName: string): string | null;
}
