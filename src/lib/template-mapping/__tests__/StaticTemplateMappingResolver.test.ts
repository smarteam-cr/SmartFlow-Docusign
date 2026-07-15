import { describe, expect, test } from '@jest/globals';
import { createStaticTemplateMappingResolver } from '../StaticTemplateMappingResolver.js';
import type { ResolutionContext, ResolutionCapex } from '../types.js';

function makeCapex(label: string): ResolutionCapex {
  return {
    codigo_qr: `Q-${label}`,
    nombre: `Nombre-${label}`,
    cantidad: `Cant-${label}`,
    costoNeto: `Costo-${label}`,
  };
}

const baseCtx: ResolutionContext = {
  templateId: 'tpl-1',
  company: { razonSocial: 'SIGMA ALIMENTOS', pais: 'MX' },
  contactoLegal: { fullName: 'Ada Lovelace', dni: 'CC-12345', pais: 'Costa Rica' },
  proveedorCountry: 'España',
  location: 'San José, Zona Franca',
  commercialAgreement: 'Acuerdo Marco 2026',
  direccionFiscal: 'Av. Central 200, San José',
  exclusiveUse: 'Uso exclusivo oficinas',
  sentDate: '11/07/2026',
  capex: [],
  quote: { hsQuoteLink: 'https://hubspot.com/q1' },
};

describe('createStaticTemplateMappingResolver', () => {
  const resolver = createStaticTemplateMappingResolver();

  test('emite las 30 keys esperadas (10 fijas + 20 capex)', () => {
    const result = resolver.resolveTabValues(baseCtx);
    expect(Object.keys(result).sort()).toEqual([
      'Commercial_Agreement',
      'codeQR_1', 'codeQR_2', 'codeQR_3', 'codeQR_4', 'codeQR_5',
      'country',
      'countryINVE',
      'datetime',
      'descriptionCapex_1', 'descriptionCapex_2', 'descriptionCapex_3', 'descriptionCapex_4', 'descriptionCapex_5',
      'direccionFiscal',
      'dniLegalRepresentative',
      'exclusiveUse',
      'legalRepresentative',
      'location',
      'price_1', 'price_2', 'price_3', 'price_4', 'price_5',
      'quantity_1', 'quantity_2', 'quantity_3', 'quantity_4', 'quantity_5',
      'urlQuotation',
    ].sort());
  });

  test('mapea contactoLegal a legalRepresentative / dniLegalRepresentative / country', () => {
    const r = resolver.resolveTabValues(baseCtx);
    expect(r.legalRepresentative).toBe('Ada Lovelace');
    expect(r.dniLegalRepresentative).toBe('CC-12345');
    expect(r.country).toBe('Costa Rica');
  });

  test('mapea proveedorCountry a countryINVE', () => {
    const r = resolver.resolveTabValues(baseCtx);
    expect(r.countryINVE).toBe('España');
  });

  test('mapea location tal cual', () => {
    const r = resolver.resolveTabValues(baseCtx);
    expect(r.location).toBe('San José, Zona Franca');
  });

  test('mapea commercialAgreement a Commercial_Agreement', () => {
    const r = resolver.resolveTabValues(baseCtx);
    expect(r.Commercial_Agreement).toBe('Acuerdo Marco 2026');
  });

  test('mapea direccionFiscal tal cual', () => {
    const r = resolver.resolveTabValues(baseCtx);
    expect(r.direccionFiscal).toBe('Av. Central 200, San José');
  });

  test('mapea exclusiveUse tal cual', () => {
    const r = resolver.resolveTabValues(baseCtx);
    expect(r.exclusiveUse).toBe('Uso exclusivo oficinas');
  });

  test('mapea sentDate a datetime', () => {
    const r = resolver.resolveTabValues(baseCtx);
    expect(r.datetime).toBe('11/07/2026');
  });

  test('mapea quote a urlQuotation', () => {
    const r = resolver.resolveTabValues(baseCtx);
    expect(r.urlQuotation).toBe('https://hubspot.com/q1');
  });

  test('quote vacío → urlQuotation vacío', () => {
    const r = resolver.resolveTabValues({ ...baseCtx, quote: { hsQuoteLink: '' } });
    expect(r.urlQuotation).toBe('');
  });

  test('0 capex: todos los slots vacíos', () => {
    const r = resolver.resolveTabValues({ ...baseCtx, capex: [] });
    for (let i = 1; i <= 5; i++) {
      expect(r[`codeQR_${i}`]).toBe('');
      expect(r[`descriptionCapex_${i}`]).toBe('');
      expect(r[`quantity_${i}`]).toBe('');
      expect(r[`price_${i}`]).toBe('');
    }
  });

  test('3 capex: slots 1-3 con datos, 4-5 vacíos', () => {
    const capex = [makeCapex('A'), makeCapex('B'), makeCapex('C')];
    const r = resolver.resolveTabValues({ ...baseCtx, capex });
    expect(r.codeQR_1).toBe('Q-A');
    expect(r.descriptionCapex_2).toBe('Nombre-B');
    expect(r.quantity_3).toBe('Cant-C');
    expect(r.price_3).toBe('Costo-C');
    expect(r.codeQR_4).toBe('');
    expect(r.descriptionCapex_4).toBe('');
    expect(r.quantity_5).toBe('');
    expect(r.price_5).toBe('');
  });

  test('5 capex: slots 1-5 llenos', () => {
    const capex = ['A', 'B', 'C', 'D', 'E'].map(makeCapex);
    const r = resolver.resolveTabValues({ ...baseCtx, capex });
    expect(r.codeQR_5).toBe('Q-E');
    expect(r.descriptionCapex_5).toBe('Nombre-E');
    expect(r.quantity_5).toBe('Cant-E');
    expect(r.price_5).toBe('Costo-E');
  });

  test('tolerancia: contexto totalmente vacío produce strings vacíos en todas las keys', () => {
    const sparseCtx: ResolutionContext = {
      templateId: 'tpl-1',
      company: { razonSocial: '', pais: '' },
      contactoLegal: { fullName: '', dni: '', pais: '' },
      proveedorCountry: '',
      location: '',
      commercialAgreement: '',
      direccionFiscal: '',
      exclusiveUse: '',
      sentDate: '',
      capex: [],
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
      contactoLegal: { fullName: undefined, dni: undefined, pais: undefined },
      proveedorCountry: undefined,
      location: undefined,
      commercialAgreement: undefined,
      direccionFiscal: undefined,
      exclusiveUse: undefined,
      sentDate: undefined,
      capex: [{ codigo_qr: undefined, nombre: undefined, cantidad: undefined, costoNeto: undefined }],
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
