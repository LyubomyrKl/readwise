import {
  basisLabel,
  categoryBar,
  categoryScale,
  changeLabel,
  finishLines,
  horizon,
  initialDraft,
  nextMilestone,
  outlookSeries,
  paceSeries,
  pickMonth,
  RANGE_OPTIONS,
  rangeTitle,
  reachedAt,
  rangeWords,
  safetyLevel,
  worthSeries,
  yearMonths,
} from "@tools/money/lib/insights";
import type { CategoryPace, ForecastRange, ForecastResponse, WorthMonth } from "@tools/money/types";

const amount = (value: string) => ({ currency: "PLN", value, minor: value.replace(".", "") });
const point = (date: string, total: string) => ({ date, total: amount(total), assets: amount(total), liabilities: amount("0.00") });

describe("insights", () => {
  it("says which months the projections learn from", () => {
    const f = (range: ForecastRange, basisMonths: number, basisFrom: string, basisTo: string, until: string | null = null) => ({ range, basisMonths, basisFrom, basisTo, until });
    expect(basisLabel(f("last_12_months", 12, "2025-11", "2026-10"))).toBe("your last 12 months");
    expect(basisLabel(f("last_3_months", 3, "2026-08", "2026-10"))).toBe("your last 3 months");
    expect(basisLabel(f("this_year", 10, "2026-01", "2026-10"))).toBe("your 10 months this year");
    expect(basisLabel(f("custom", 5, "2026-06", "2026-10"))).toBe("your 5 months since June 2026");
    expect(basisLabel(f("custom", 3, "2026-01", "2026-03", "2026-03"))).toBe("your 3 months, Jan 2026 – Mar 2026");
    // one month: the month itself
    expect(basisLabel(f("last_month", 1, "2026-10", "2026-10"))).toBe("October 2026");
  });

  it("names a chosen range, and the months a custom one can take", () => {
    const words = (forecastRange: ForecastRange, forecastSince: string | null = null, forecastUntil: string | null = null) => rangeWords({ forecastRange, forecastSince, forecastUntil });
    expect(words("last_3_months")).toBe("your last 3 months");
    expect(words("last_month")).toBe("last month");
    expect(words("this_year")).toBe("this year");
    expect(words("custom", "2026-06")).toBe("June 2026 to now");
    expect(words("custom", "2026-01", "2026-03")).toBe("Jan 2026 – Mar 2026");
    expect(RANGE_OPTIONS.map((o) => o.label)).toEqual(["Last month", "Last 3 months", "Last 6 months", "Last 12 months", "This year", "Custom range"]);
    expect(rangeTitle({ range: "last_6_months", since: null, until: null })).toBe("Last 6 months");
    expect(rangeTitle({ range: "custom", since: "2026-06", until: null })).toBe("Jun 2026 – now");
    expect(rangeTitle({ range: "custom", since: "2026-01", until: "2026-03" })).toBe("Jan 2026 – Mar 2026");
  });

  it("offers a year's months, those not over or without movements out of reach", () => {
    expect(yearMonths(2026, "2026-11", "2025-05").map((m) => m.disabled).slice(9)).toEqual([false, true, true]); // October yes; November, December not yet
    expect(yearMonths(2025, "2026-11", "2025-05").slice(3, 5)).toEqual([
      { value: "2025-04", label: "Apr", disabled: true }, // before the first movement
      { value: "2025-05", label: "May", disabled: false },
    ]);
  });

  it("starts a custom range from the one in use, or from the months in use now to now", () => {
    expect(initialDraft({ range: "custom", since: "2026-01", until: "2026-03", basisFrom: "2026-01", month: "2026-11" })).toEqual({ from: "2026-01", to: "2026-03" });
    expect(initialDraft({ range: "last_3_months", since: null, until: null, basisFrom: "2026-08", month: "2026-11" })).toEqual({ from: "2026-08", to: null });
  });

  it("picks the first month, then the last, either way round", () => {
    const start = { from: "2026-08", to: null };
    // the first month, then the last
    const first = pickMonth(start, "from", "2026-06");
    expect(first).toEqual({ draft: { from: "2026-06", to: null }, end: "to" });
    expect(pickMonth(first.draft, "to", "2026-09")).toEqual({ draft: { from: "2026-06", to: "2026-09" }, end: "from" });
    // a last month before the first: swapped
    expect(pickMonth(first.draft, "to", "2026-02").draft).toEqual({ from: "2026-02", to: "2026-06" });
    // a first month after the last: the last goes back to now
    expect(pickMonth({ from: "2026-01", to: "2026-03" }, "from", "2026-05").draft).toEqual({ from: "2026-05", to: null });
  });

  it("finds the next round figure net worth reaches at this pace", () => {
    const ahead = [
      { date: "2026-12-31", value: 196_000 },
      { date: "2027-01-31", value: 203_000 },
      { date: "2027-02-28", value: 210_000 },
    ];
    expect(nextMilestone(183_339, ahead)).toEqual({ target: 200_000, date: "2027-01-31" });
    expect(nextMilestone(183_339, ahead.slice(0, 1))).toEqual({ target: 200_000, date: null });
    expect(nextMilestone(1_200_000, [{ date: "2027-01-31", value: 1_600_000 }])).toEqual({ target: 1_500_000, date: "2027-01-31" });
    expect(nextMilestone(-5_000, [{ date: "2027-01-31", value: 1_000 }])).toEqual({ target: 0, date: "2027-01-31" });
    expect(nextMilestone(200_000, [{ date: "2027-01-31", value: 190_000 }])).toBeNull();
  });

  it("finds when the way ahead reaches a figure, and with more saved each month", () => {
    const ahead = [
      { date: "2026-12-31", value: 190 },
      { date: "2027-01-31", value: 197 },
      { date: "2027-02-28", value: 204 },
    ];
    expect(reachedAt(200, ahead)).toEqual({ date: "2027-02-28", months: 3 });
    expect(reachedAt(200, ahead, 5)).toEqual({ date: "2027-01-31", months: 2 }); // 197 + 2 × 5
    expect(reachedAt(500, ahead)).toBeNull();
  });

  it("puts the finish lines on the way ahead: how far along, when, and how much sooner a tenth less spending gets there", () => {
    const at = (date: string, value: string) => ({ date, value: amount(value), low: amount(value), high: amount(value) });
    const nw = {
      history: [point("2026-10-31", "150.00")],
      months: [],
      monthlySaving: amount("10.00"),
      savingMonths: 12,
      grown: null,
      lever: amount("10.00"),
      goals: [
        { id: "a", name: null, target: amount("100.00") },
        { id: "b", name: "Flat", target: amount("170.00") },
        { id: "c", name: null, target: amount("999.00") },
      ],
      invested: amount("0.00"),
      expectedReturn: "0",
      projection: [at("2026-11-30", "160.00"), at("2026-12-31", "170.00"), at("2027-01-31", "180.00")],
    } as ForecastResponse["netWorth"];
    const [reached, flat, far] = finishLines(nw);
    expect(reached).toMatchObject({ reached: true, progress: 1, at: null, sooner: null });
    // 150 of 170: there in two months at this pace, in one with 10 more saved a month (160 + 10)
    expect(flat).toMatchObject({ reached: false, at: { date: "2026-12-31", months: 2 }, sooner: { date: "2026-11-30", months: 1 } });
    // no sooner to tell when the extra crosses it in the same month
    expect(finishLines({ ...nw, lever: amount("5.00") })[1].sooner).toBeNull();
    expect(flat.progress).toBeCloseTo(150 / 170);
    expect(far).toMatchObject({ reached: false, at: null, sooner: null });
    expect(horizon(nw, 1).projection).toHaveLength(3);
    expect(horizon({ ...nw, projection: Array.from({ length: 120 }, (_, i) => at(`d${i}`, "1.00")) }, 5).projection).toHaveLength(60);
  });

  it("puts the safety net against three to six months", () => {
    expect([safetyLevel("2.5"), safetyLevel("4.0"), safetyLevel("11.5"), safetyLevel(null)]).toEqual(["below", "within", "beyond", null]);
  });

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
      savingMonths: 12,
      grown: null,
      lever: null,
      goals: [],
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
