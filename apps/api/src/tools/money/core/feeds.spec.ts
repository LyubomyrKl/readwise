import { dateChunks, monthEndPrices, parseEcbXml, parseNbpTables, parseYahooChart, roundDecimalText } from './feeds';

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
  // the shape Yahoo answers for VWCE.DE (trimmed): bars open at 08:00 Berlin, closes as float text
  const chart = (stamps: string, closes: string) =>
    `{"chart":{"result":[{"meta":{"currency":"EUR","symbol":"VWCE.DE","gmtoffset":3600,"priceHint":2,` +
    `"currentTradingPeriod":{"pre":{"gmtoffset":3600}}},"timestamp":[${stamps}],"indicators":{"quote":[{"high":[1,1,1,1],` +
    `"close":[${closes}],"low":[1,1,1,1]}],"adjclose":[{"adjclose":[9,9,9,9]}]}}],"error":null}}`;

  it('reads Yahoo closes exactly: dated in the exchange zone, rounded to its precision, no float', () => {
    // 2026-09-29, 2026-09-30, 2026-10-01 and 2026-10-27, each at 07:00 UTC (08:00 CET)
    const parsed = parseYahooChart(chart('1790665200,1790751600,1790838000,1793084400', '126.0999984741211,126.40499877929688,null,169.3000030517578'));
    expect(parsed).toEqual({
      currency: 'EUR',
      prices: [
        { date: '2026-09-29', price: '126.10' },
        { date: '2026-09-30', price: '126.40' },
        { date: '2026-10-27', price: '169.30' },
      ],
    });
    expect(monthEndPrices(parsed!.prices)).toEqual([
      { date: '2026-09-30', price: '126.40' },
      { date: '2026-10-27', price: '169.30' },
    ]);
  });

  it('rounds half up in decimal text and refuses an unknown symbol', () => {
    expect(roundDecimalText('126.40499877929688', 2)).toBe('126.40');
    expect(roundDecimalText('126.405', 2)).toBe('126.41');
    expect(roundDecimalText('0.999996', 4)).toBe('1.0000');
    expect(roundDecimalText('0.00001', 2)).toBeNull();
    expect(parseYahooChart('{"chart":{"result":null,"error":{"code":"Not Found","description":"No data found, symbol may be delisted"}}}')).toBeNull();
  });
});
