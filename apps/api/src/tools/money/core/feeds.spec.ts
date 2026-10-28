import { dateChunks, monthEndPrices, parseEcbXml, parseNbpTables, parseStooqHistory, parseStooqQuote } from './feeds';

const ECB = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <gesmes:Sender><gesmes:name>European Central Bank</gesmes:name></gesmes:Sender>
  <Cube>
    <Cube time="2026-10-27">
      <Cube currency="USD" rate="1.1640"/>
      <Cube currency="JPY" rate="176.53"/>
      <Cube currency="PLN" rate="4.2650"/>
    </Cube>
    <Cube time='2026-10-26'>
      <Cube rate="1.1622" currency="USD" />
      <Cube currency="PLN" rate="N/A"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

const NBP = `[{"table":"A","no":"207/A/NBP/2026","effectiveDate":"2026-10-23","rates":[{"currency":"bat (Tajlandia)","code":"THB","mid":0.1123},{"currency":"dolar amerykański","code":"USD","mid":3.6512},{"currency":"euro","code":"EUR","mid":4.2600}]},
 {"table":"A","no":"208/A/NBP/2026","effectiveDate":"2026-10-24","rates":[{"currency":"euro","code":"EUR","mid":4.2611},{"currency":"forint (Węgry)","code":"HUF","mid":1.1e-2}]}]`;

describe('rate feeds', () => {
  it('reads ECB reference rates as published, euro to each currency', () => {
    expect(parseEcbXml(ECB)).toEqual([
      { date: '2026-10-27', from: 'EUR', to: 'USD', rate: '1.1640' },
      { date: '2026-10-27', from: 'EUR', to: 'JPY', rate: '176.53' },
      { date: '2026-10-27', from: 'EUR', to: 'PLN', rate: '4.2650' },
      { date: '2026-10-26', from: 'EUR', to: 'USD', rate: '1.1622' },
    ]);
  });

  it('reads NBP table A from the text, keeping the published digits', () => {
    expect(parseNbpTables(NBP)).toEqual([
      { date: '2026-10-23', from: 'THB', to: 'PLN', rate: '0.1123' },
      { date: '2026-10-23', from: 'USD', to: 'PLN', rate: '3.6512' },
      { date: '2026-10-23', from: 'EUR', to: 'PLN', rate: '4.2600' },
      { date: '2026-10-24', from: 'EUR', to: 'PLN', rate: '4.2611' },
    ]);
    expect(parseNbpTables('<html>404 NotFound - Not Found - Brak danych</html>')).toEqual([]);
  });

  it('splits a long span into queries NBP accepts', () => {
    expect(dateChunks('2026-01-01', '2026-04-15', 50)).toEqual([
      ['2026-01-01', '2026-02-19'],
      ['2026-02-20', '2026-04-10'],
      ['2026-04-11', '2026-04-15'],
    ]);
    expect(dateChunks('2026-05-02', '2026-05-01')).toEqual([]);
  });
});

describe('price feed', () => {
  it('reads the latest Stooq close and ignores unknown symbols', () => {
    expect(parseStooqQuote('Symbol,Date,Time,Open,High,Low,Close,Volume\r\nVWCE.DE,2026-10-27,17:36:22,129.5,130.1,129.2,129.88,152345\r\n')).toEqual({
      date: '2026-10-27',
      price: '129.88',
    });
    expect(parseStooqQuote('Symbol,Date,Time,Open,High,Low,Close,Volume\nXXX.DE,N/D,N/D,N/D,N/D,N/D,N/D,N/D')).toBeNull();
    expect(parseStooqQuote('Przekroczony dzienny limit wywolan')).toBeNull();
  });

  it('reads a Stooq history and keeps the last close of each month', () => {
    const history = parseStooqHistory(
      'Date,Open,High,Low,Close,Volume\n2026-09-29,1,1,1,126.10,10\n2026-09-30,1,1,1,126.40,10\n2026-10-01,1,1,1,127.02,10\n2026-10-27,1,1,1,129.88,10\n',
    );
    expect(history).toHaveLength(4);
    expect(monthEndPrices(history)).toEqual([
      { date: '2026-09-30', price: '126.40' },
      { date: '2026-10-27', price: '129.88' },
    ]);
    expect(parseStooqHistory('Brak danych')).toEqual([]);
  });
});
