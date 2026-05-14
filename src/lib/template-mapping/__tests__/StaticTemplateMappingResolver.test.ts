import { describe, expect, test } from '@jest/globals';
import { createStaticTemplateMappingResolver } from '../StaticTemplateMappingResolver.js';
import type { ResolutionContext, ResolutionCapex } from '../types.js';

function makeCapex(label: string): ResolutionCapex {
  return {
    qrCapex: `Q-${label}`,
    nombre: `Nombre-${label}`,
    cantidad: `Cant-${label}`,
    costoNeto: `Costo-${label}`,
  };
}

const baseCtx: ResolutionContext = {
  templateId: 'tpl-1',
  company: { razonSocial: 'SIGMA ALIMENTOS', pais: 'MX' },
  contactoLegal: { firstName: 'Ada', lastName: 'Lovelace', docIdentificacion: 'CC-12345' },
  capex: [],
  direccion: { direction: 'Calle 100 #5-30' },
  quote: { hsQuoteLink: 'https://hubspot.com/q1' },
};

describe('createStaticTemplateMappingResolver', () => {
  const resolver = createStaticTemplateMappingResolver();

  test('emite las 31 keys esperadas (7 fijas + 24 capex)', () => {
    const result = resolver.resolveTabValues(baseCtx);
    expect(Object.keys(result).sort()).toEqual([
      '#HREF_UrlCotizacion',
      'ApellidosCliente',
      'CantidadCpx1', 'CantidadCpx2', 'CantidadCpx3', 'CantidadCpx4', 'CantidadCpx5', 'CantidadCpx6',
      'CostoCpx1', 'CostoCpx2', 'CostoCpx3', 'CostoCpx4', 'CostoCpx5', 'CostoCpx6',
      'DirecUbiComodato',
      'DocIdentCliente',
      'NombreCliente',
      'NombreCpx1', 'NombreCpx2', 'NombreCpx3', 'NombreCpx4', 'NombreCpx5', 'NombreCpx6',
      'PaisRazonSocial',
      'QrCpx1', 'QrCpx2', 'QrCpx3', 'QrCpx4', 'QrCpx5', 'QrCpx6',
      'RazonSocial',
    ].sort());
  });

  test('mapea Company a RazonSocial y PaisRazonSocial', () => {
    const r = resolver.resolveTabValues(baseCtx);
    expect(r.RazonSocial).toBe('SIGMA ALIMENTOS');
    expect(r.PaisRazonSocial).toBe('MX');
  });

  test('mapea contactoLegal a NombreCliente / ApellidosCliente / DocIdentCliente', () => {
    const r = resolver.resolveTabValues(baseCtx);
    expect(r.NombreCliente).toBe('Ada');
    expect(r.ApellidosCliente).toBe('Lovelace');
    expect(r.DocIdentCliente).toBe('CC-12345');
  });

  test('mapea direccion a DirecUbiComodato', () => {
    const r = resolver.resolveTabValues(baseCtx);
    expect(r.DirecUbiComodato).toBe('Calle 100 #5-30');
  });

  test('mapea quote a #HREF_UrlCotizacion', () => {
    const r = resolver.resolveTabValues(baseCtx);
    expect(r['#HREF_UrlCotizacion']).toBe('https://hubspot.com/q1');
  });

  test('direccion null → DirecUbiComodato vacío', () => {
    const r = resolver.resolveTabValues({ ...baseCtx, direccion: null });
    expect(r.DirecUbiComodato).toBe('');
  });

  test('quote vacío → #HREF_UrlCotizacion vacío', () => {
    const r = resolver.resolveTabValues({ ...baseCtx, quote: { hsQuoteLink: '' } });
    expect(r['#HREF_UrlCotizacion']).toBe('');
  });

  test('0 capex: todos los slots vacíos', () => {
    const r = resolver.resolveTabValues({ ...baseCtx, capex: [] });
    for (let i = 1; i <= 6; i++) {
      expect(r[`QrCpx${i}`]).toBe('');
      expect(r[`NombreCpx${i}`]).toBe('');
      expect(r[`CantidadCpx${i}`]).toBe('');
      expect(r[`CostoCpx${i}`]).toBe('');
    }
  });

  test('3 capex: slots 1-3 con datos, 4-6 vacíos', () => {
    const capex = [makeCapex('A'), makeCapex('B'), makeCapex('C')];
    const r = resolver.resolveTabValues({ ...baseCtx, capex });
    expect(r.QrCpx1).toBe('Q-A');
    expect(r.NombreCpx2).toBe('Nombre-B');
    expect(r.CostoCpx3).toBe('Costo-C');
    expect(r.QrCpx4).toBe('');
    expect(r.NombreCpx5).toBe('');
    expect(r.CostoCpx6).toBe('');
  });

  test('6 capex: slots 1-6 llenos', () => {
    const capex = ['A', 'B', 'C', 'D', 'E', 'F'].map(makeCapex);
    const r = resolver.resolveTabValues({ ...baseCtx, capex });
    expect(r.QrCpx6).toBe('Q-F');
    expect(r.NombreCpx6).toBe('Nombre-F');
    expect(r.CantidadCpx6).toBe('Cant-F');
    expect(r.CostoCpx6).toBe('Costo-F');
  });

  test('tolerancia: contexto totalmente vacío produce strings vacíos en todas las keys', () => {
    const sparseCtx: ResolutionContext = {
      templateId: 'tpl-1',
      company: { razonSocial: '', pais: '' },
      contactoLegal: { firstName: '', lastName: '', docIdentificacion: '' },
      capex: [],
      direccion: null,
      quote: { hsQuoteLink: '' },
    };
    const r = resolver.resolveTabValues(sparseCtx);
    for (const value of Object.values(r)) {
      expect(value).toBe('');
    }
  });

  test('tolerancia: undefined en cualquier source → string vacío', () => {
    const undefinedCtx = {
      templateId: 'tpl-1',
      company: { razonSocial: undefined, pais: undefined },
      contactoLegal: { firstName: undefined, lastName: undefined, docIdentificacion: undefined },
      capex: [{ qrCapex: undefined, nombre: undefined, cantidad: undefined, costoNeto: undefined }],
      direccion: null,
      quote: { hsQuoteLink: undefined },
    } as unknown as ResolutionContext;

    const r = resolver.resolveTabValues(undefinedCtx);
    for (const value of Object.values(r)) {
      expect(value).toBe('');
    }
  });

  test('no depende de templateId (mismo output para cualquier template)', () => {
    const a = resolver.resolveTabValues(baseCtx);
    const b = resolver.resolveTabValues({ ...baseCtx, templateId: 'tpl-DIFFERENT' });
    expect(a).toEqual(b);
  });
});
