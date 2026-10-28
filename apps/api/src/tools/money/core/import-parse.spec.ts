import { decodeBytes, detectDelimiter, parseCsv } from './csv';
import {
  detectDateFormat,
  fingerprint,
  guessColumns,
  parseAmountCell,
  parseDateCell,
  withOrdinals,
} from './import-parse';

describe('csv', () => {
  it('decodes UTF-8 with or without a BOM, and Windows-1250 as Polish banks write it', () => {
    const utf8 = new TextEncoder().encode('Zażółć');
    expect(decodeBytes(utf8)).toEqual({ text: 'Zażółć', encoding: 'utf-8' });
    expect(decodeBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8])).text).toBe('Zażółć');
    // "Zażółć" in windows-1250: Z a 0xBF 0xF3 0xB3 0xE6
    const cp1250 = new Uint8Array([0x5a, 0x61, 0xbf, 0xf3, 0xb3, 0xe6]);
    expect(decodeBytes(cp1250)).toEqual({ text: 'Zażółć', encoding: 'windows-1250' });
  });

  it('detects the delimiter', () => {
    expect(detectDelimiter('a;b;c\n1;2,5;3')).toBe(';');
    expect(detectDelimiter('a,b,c\n1,"2;5",3')).toBe(',');
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
  });

  it('parses quotes, doubled quotes, embedded newlines and CRLF', () => {
    const text = 'Date,Note,Amount\r\n2026-10-01,"Coffee, ""large""",-12.50\r\n2026-10-02,"two\nlines",3\r\n\r\n';
    expect(parseCsv(text)).toEqual([
      ['Date', 'Note', 'Amount'],
      ['2026-10-01', 'Coffee, "large"', '-12.50'],
      ['2026-10-02', 'two\nlines', '3'],
    ]);
    expect(parseCsv('a;b\n1;\n')).toEqual([
      ['a', 'b'],
      ['1', ''],
    ]);
  });
});

describe('import cells', () => {
  it.each([
    ['2026-10-28', 'YYYY-MM-DD', '2026-10-28'],
    ['2026-10-28 14:03:00', 'YYYY-MM-DD', '2026-10-28'],
    ['28.10.2026', 'DD.MM.YYYY', '2026-10-28'],
    ['3/4/2026', 'MM/DD/YYYY', '2026-03-04'],
    ['3/4/2026', 'DD/MM/YYYY', '2026-04-03'],
    ['31.02.2026', 'DD.MM.YYYY', null],
  ] as const)('reads %s as %s', (value, format, expected) => {
    expect(parseDateCell(value, format)).toBe(expected);
  });

  it('detects the date format from samples', () => {
    expect(detectDateFormat(['28.10.2026', '01.11.2026'])).toBe('DD.MM.YYYY');
    expect(detectDateFormat(['10/28/2026', '11/01/2026'])).toBe('MM/DD/YYYY');
    expect(detectDateFormat(['28/10/2026', '01/11/2026'])).toBe('DD/MM/YYYY');
    expect(detectDateFormat(['2026-10-28T10:00:00Z'])).toBe('YYYY-MM-DD');
    expect(detectDateFormat(['yesterday'])).toBeNull();
  });

  it.each([
    ['1234.56', '1234.56'],
    ['-1 234,56', '-1234.56'],
    ['1.234,56', '1234.56'],
    ['1,234.56', '1234.56'],
    ['-12,34 PLN', '-12.34'],
    ['(12.34)', '-12.34'],
    ['12.34-', '-12.34'],
    ['+5', '5'],
    ['−7,10', '-7.10'],
    ['1.234.567', '1234567'],
    ['0,00', '0.00'],
    ['-0,00', '0.00'],
    ['€ 9.99', '9.99'],
    ['', null],
    ['n/a', null],
  ])('reads the amount %p as %p', (value, expected) => {
    expect(parseAmountCell(value)).toBe(expected);
  });

  it('honours an explicit decimal separator', () => {
    expect(parseAmountCell('1.234', ',')).toBe('1234');
    expect(parseAmountCell('1,234', ',')).toBe('1.234');
    expect(parseAmountCell('1,234', '.')).toBe('1234');
  });

  it('fingerprints movements so identical rows of one file stay distinct', () => {
    const rows = ['coffee', 'coffee', 'tea'];
    const tagged = withOrdinals(rows, (r) => r);
    expect(tagged.map((t) => t.ordinal)).toEqual([0, 1, 0]);
    const a = fingerprint(['2026-10-01', '-12.50', 'Coffee  shop'], 0);
    expect(fingerprint(['2026-10-01', '-12.50', 'coffee shop'], 0)).toBe(a);
    expect(fingerprint(['2026-10-01', '-12.50', 'coffee shop'], 1)).not.toBe(a);
  });

  it('guesses columns from English and Polish headers', () => {
    expect(guessColumns(['Date', 'Account', 'Category', 'Subcategory', 'Note', 'Amount', 'Currency', 'Type'])).toEqual({
      date: 0,
      account: 1,
      category: 2,
      subcategory: 3,
      note: 4,
      amount: 5,
      currency: 6,
      type: 7,
    });
    expect(guessColumns(['#Data operacji', '#Opis operacji', '#Rachunek', '#Kategoria', '#Kwota'])).toEqual({
      date: 0,
      note: 1,
      account: 2,
      category: 3,
      amount: 4,
    });
    expect(guessColumns(['DATE', 'TYPE', 'FROM ACCOUNT', 'TO ACCOUNT / TO CATEGORY', 'AMOUNT', 'CURRENCY', 'AMOUNT 2', 'CURRENCY 2', 'NOTES'])).toMatchObject({
      date: 0,
      type: 1,
      account: 2,
      toAccount: 3,
      amount: 4,
      currency: 5,
      toAmount: 6,
      toCurrency: 7,
      note: 8,
    });
  });
});
