import { categoryBar, categoryScale, changeLabel, outlookSeries, paceSeries, worthSeries } from "@tools/money/lib/insights";
import type { CategoryPace, ForecastResponse, WorthMonth } from "@tools/money/types";

const amount = (value: string) => ({ currency: "PLN", value, minor: value.replace(".", "") });
const point = (date: string, total: string) => ({ date, total: amount(total), assets: amount(total), liabilities: amount("0.00") });

describe("insights", () => {
  it("draws this month's running total against the usual one, nothing after today", () => {
    const s = paceSeries([
      { day: 1, actual: amount("10.00"), typical: amount("8.00"), low: amount("5.00"), high: amount("9.00") },
      { day: 2, actual: null, typical: amount("12.00"), low: null, high: null },
    ]);
    expect(s).toEqual({ labels: ["1", "2"], actual: [10, null], typical: [8, 12], low: [5, null], high: [9, null] });
  });

  it("joins net worth behind and ahead at today, the range starting there", () => {
    const nw: ForecastResponse["netWorth"] = {
      history: [point("2026-09-30", "100.00"), point("2026-10-31", "150.00")],
      months: [],
      monthlySaving: amount("50.00"),
      invested: amount("0.00"),
      expectedReturn: "0",
      projection: [{ date: "2026-11-30", value: amount("200.00"), low: amount("180.00"), high: amount("220.00") }],
    };
    const o = outlookSeries(nw);
    expect([o.history, o.projection, o.low, o.high, o.today]).toEqual([
      [100, 150, null],
      [null, 150, 200],
      [null, 150, 180],
      [null, 150, 220],
      1,
    ]);
    expect(o.labels).toHaveLength(3);
    // nothing ahead: only what is behind
    expect(outlookSeries({ ...nw, projection: [] }).projection).toEqual([null, null]);
  });

  it("says above or below usual, and whether that is good news", () => {
    expect(changeLabel("23.4", "expense")).toEqual({ text: "23% above usual", direction: "up", tone: "warn" });
    expect(changeLabel("-12.0", "expense")).toMatchObject({ text: "12% below usual", direction: "down", tone: "good" });
    expect(changeLabel("23.4", "income")).toMatchObject({ tone: "good" });
    expect(changeLabel("-30.0", "income")).toMatchObject({ tone: "warn" });
    expect(changeLabel("3.0", "expense")).toEqual({ text: "About usual", direction: "even", tone: "neutral" });
    expect(changeLabel(null, "expense")).toBeNull();
  });

  it("puts every category on one scale: so far, projected, and the usual month's tick", () => {
    const category = (soFar: string, projected: string, usual: string | null) =>
      ({
        categoryId: soFar,
        name: "Groceries",
        soFar: amount(soFar),
        projected: amount(projected),
        low: amount(projected),
        high: amount(projected),
        typicalByNow: null,
        typicalMonth: usual ? amount(usual) : null,
        change: null,
      }) as CategoryPace;
    const list = [category("50.00", "100.00", "80.00"), category("20.00", "40.00", null)];
    expect(categoryScale(list)).toBe(100);
    expect(categoryBar(list[0], 100)).toEqual({ soFar: 50, projected: 100, usual: 80 });
    expect(categoryBar(list[1], 100)).toEqual({ soFar: 20, projected: 40, usual: null });
    expect(categoryScale([])).toBe(0);
  });

  it("puts the tick of a category that comes in lumps at its average month", () => {
    const holiday = {
      categoryId: "leisure",
      name: "Leisure",
      soFar: amount("0.00"),
      projected: amount("0.00"),
      low: amount("0.00"),
      high: amount("0.00"),
      typicalByNow: amount("0.00"),
      typicalMonth: amount("0.00"),
      change: null,
      averageMonth: amount("300.00"),
      monthsWith: 1,
      lumpy: true,
    } as CategoryPace;
    expect(categoryScale([holiday])).toBe(300);
    expect(categoryBar(holiday, 600)).toEqual({ soFar: 0, projected: 0, usual: 50 });
  });

  it("stacks each month's change: saved, markets, one-offs with the accounts added, and the net", () => {
    const month = (m: string, change: string, saved: string, markets: string, oneOffs: string, added: string): WorthMonth => ({
      month: m,
      change: amount(change),
      saved: amount(saved),
      markets: amount(markets),
      oneOffs: amount(oneOffs),
      added: amount(added),
    });
    const s = worthSeries([month("2026-03", "6500.00", "1500.00", "0.00", "0.00", "5000.00"), month("2026-04", "-300.00", "2500.00", "-2800.00", "0.00", "0.00")]);
    expect([s.saved, s.markets, s.oneOffs, s.net]).toEqual([
      [1500, 2500],
      [0, -2800],
      [5000, 0],
      [6500, -300],
    ]);
    expect(s.labels).toHaveLength(2);
  });
});
