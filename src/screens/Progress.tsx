import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useApp } from '../state';
import { addDays, daysBetween, formatDate, startOfMonth, startOfWeek, toDateKey, isValidDateKey } from '../lib/dates';
import { aggregate, bucketByMonth, bucketByWeek, previousPeriod, summarizeDays, weightChangeInRange } from '../lib/progress';
import type { Aggregate, Bucket, DayBasis } from '../lib/progress';
import { fmtGrams, fmtKcal } from '../lib/nutrition';
import { sortWeights } from '../lib/weight';
import { Field, Section, Segmented } from '../components/ui';
import { BarChart, LineChart } from '../components/Charts';
import type { BarDatum, LineSeries } from '../components/Charts';

type View = 'daily' | 'weekly' | 'monthly';

function defaultRange(view: View, today: string): [string, string] {
  if (view === 'daily') return [addDays(today, -13), today];
  if (view === 'weekly') return [addDays(startOfWeek(today), -7 * 7), today];
  const d = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - 5, 1, 12);
  return [startOfMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`), today];
}

export function ProgressScreen() {
  const { data } = useApp();
  const d = data!;
  const t = d.profile.targets;
  const today = toDateKey();
  const [view, setView] = useState<View>('weekly');
  const [range, setRange] = useState<[string, string]>(defaultRange('weekly', today));
  const [basis, setBasis] = useState<DayBasis>('logged');
  const [from, to] = range;
  const valid = isValidDateKey(from) && isValidDateKey(to) && from <= to && daysBetween(from, to) <= 800;

  const days = useMemo(() => (valid ? summarizeDays(from, to, d.food, d.exercise, d.days) : []), [valid, from, to, d.food, d.exercise, d.days]);
  const agg = aggregate(days, t, basis);
  const [pf, pt] = previousPeriod(from, to);
  const prevAgg = aggregate(summarizeDays(pf, pt, d.food, d.exercise, d.days), t, basis);
  const wChange = weightChangeInRange(d.weights, from, to);

  const buckets: Bucket[] = useMemo(() => {
    if (view === 'daily') return days.map((x) => ({ key: x.date, label: formatDate(x.date, { month: 'numeric', day: 'numeric' }), from: x.date, to: x.date, days: [x] }));
    return view === 'weekly' ? bucketByWeek(days) : bucketByMonth(days);
  }, [view, days]);
  const bAgg = buckets.map((b) => ({ b, a: aggregate(b.days, t, basis) }));

  const calBars: BarDatum[] = bAgg.map(({ b, a }) => ({ label: b.label, value: a.avg ? a.avg.calories : null, detail: view === 'daily' ? undefined : `${a.daysCounted} day${a.daysCounted === 1 ? '' : 's'} counted` }));
  const proBars: BarDatum[] = bAgg.map(({ b, a }) => ({ label: b.label, value: a.avg ? a.avg.protein : null }));
  const exBars: BarDatum[] = bAgg.map(({ b, a }) => ({ label: b.label, value: a.exerciseMinutes, detail: `${a.workouts} workout${a.workouts === 1 ? '' : 's'}` }));

  const ws = sortWeights(d.weights).filter((w) => w.date >= from && w.date <= to);
  const wSeries: LineSeries[] = ws.length ? [{ name: 'Weigh-ins', kind: 'actual', points: ws.map((w) => ({ x: daysBetween(from, w.date), y: w.weight, label: formatDate(w.date, { month: 'short', day: 'numeric' }) })) }] : [];
  const span = Math.max(1, daysBetween(from, to));

  return (
    <div className="stack">
      <h1>Progress</h1>
      <Segmented
        label="Time view"
        value={view}
        onChange={(v) => {
          setView(v);
          setRange(defaultRange(v, today));
        }}
        options={[
          { value: 'daily', label: 'Daily' },
          { value: 'weekly', label: 'Weekly' },
          { value: 'monthly', label: 'Monthly' },
        ]}
      />
      <div className="grid2">
        <Field label="From" htmlFor="pr-from">
          <input id="pr-from" type="date" value={from} max={to} onChange={(e) => setRange([e.target.value, to])} />
        </Field>
        <Field label="To" htmlFor="pr-to">
          <input id="pr-to" type="date" value={to} min={from} max={today} onChange={(e) => setRange([from, e.target.value])} />
        </Field>
      </div>
      {!valid && <p className="warn">Choose a range of up to about two years, with the start before the end.</p>}
      <label className="check">
        <input type="checkbox" checked={basis === 'complete'} onChange={(e) => setBasis(e.target.checked ? 'complete' : 'logged')} /> Average only days marked complete
      </label>

      <Section title="Summary">
        <p className="muted small">
          {agg.daysLogged} of {agg.days} days have food logged
          {agg.daysComplete ? `, ${agg.daysComplete} marked complete` : ''}. Averages use {basis === 'complete' ? 'complete days' : 'logged days'} only; days with nothing logged are left out, not counted as zero.
        </p>
        <SummaryTable cur={agg} prev={prevAgg} weightChange={wChange?.change ?? null} prevLabel={`${formatDate(pf, { month: 'short', day: 'numeric' })} to ${formatDate(pt, { month: 'short', day: 'numeric' })}`} />
      </Section>

      <Section title="Calories">
        <BarChart title={view === 'daily' ? 'Calories per day' : 'Average calories per logged day'} unit="kcal" data={calBars} target={t.calories} />
      </Section>
      <Section title="Protein">
        <BarChart title={view === 'daily' ? 'Protein per day' : 'Average protein per logged day'} unit="g" data={proBars} target={t.protein} tone="protein" />
      </Section>

      <Section title="Macros by period">
        <div className="table-scroll">
          <table className="mini-table">
            <thead>
              <tr>
                <th scope="col">{view === 'daily' ? 'Day' : view === 'weekly' ? 'Week of' : 'Month'}</th>
                <th scope="col">kcal</th>
                <th scope="col">Protein</th>
                <th scope="col">Carbs</th>
                <th scope="col">Fat</th>
                <th scope="col">Fiber</th>
                <th scope="col">Days</th>
              </tr>
            </thead>
            <tbody>
              {bAgg.map(({ b, a }) => (
                <tr key={b.key}>
                  <th scope="row">{b.label}</th>
                  {a.avg ? (
                    <>
                      <td>{fmtKcal(a.avg.calories)}</td>
                      <td>{fmtGrams(a.avg.protein)}</td>
                      <td>{fmtGrams(a.avg.carbs)}</td>
                      <td>{fmtGrams(a.avg.fat)}</td>
                      <td>{fmtGrams(a.avg.fiber)}</td>
                    </>
                  ) : (
                    <td colSpan={5} className="muted">
                      Not logged
                    </td>
                  )}
                  <td>
                    {a.daysCounted}/{a.days}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">Values are averages per counted day, in grams. Target: {fmtKcal(t.calories)} kcal, {t.protein} g protein, {t.carbs} g carbs, {t.fat} g fat, {t.fiber} g fiber.</p>
      </Section>

      <Section title="Exercise">
        <p>
          {agg.workouts} workout{agg.workouts === 1 ? '' : 's'}, {Math.round(agg.exerciseMinutes)} min, about {fmtKcal(agg.exerciseCalories)} kcal net in this range.
        </p>
        <BarChart title="Exercise minutes" unit="min" data={exBars} tone="fiber" />
      </Section>

      <Section title="Weight">
        <LineChart
          title="Weigh-ins in this range"
          unit="lb"
          series={wSeries}
          xLabels={[0, Math.round(span / 2), span].map((x) => ({ x, label: formatDate(addDays(from, x), { month: 'short', day: 'numeric' }) }))}
        />
        <p className="muted small">{wChange ? `${wChange.change > 0 ? '+' : ''}${wChange.change.toFixed(1)} lb between ${formatDate(wChange.first.date, { month: 'short', day: 'numeric' })} and ${formatDate(wChange.last.date, { month: 'short', day: 'numeric' })}.` : 'Needs at least two weigh-ins in this range to show a change.'}</p>
      </Section>
    </div>
  );
}

function SummaryTable({ cur, prev, weightChange, prevLabel }: { cur: Aggregate; prev: Aggregate; weightChange: number | null; prevLabel: string }) {
  const diff = (a: number | undefined, b: number | undefined, unit: string, dec = 0) => {
    if (a === undefined || b === undefined) return <span className="muted">–</span>;
    const v = a - b;
    if (Math.abs(v) < Math.pow(10, -dec) / 2) return 'same';
    return `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(dec)} ${unit}`;
  };
  const rows: [string, string, string, ReactNode][] = [
    ['Avg calories', cur.avg ? fmtKcal(cur.avg.calories) : '–', prev.avg ? fmtKcal(prev.avg.calories) : '–', diff(cur.avg?.calories, prev.avg?.calories, 'kcal')],
    ['Avg protein', cur.avg ? `${fmtGrams(cur.avg.protein)} g` : '–', prev.avg ? `${fmtGrams(prev.avg.protein)} g` : '–', diff(cur.avg?.protein, prev.avg?.protein, 'g')],
    ['Avg carbs', cur.avg ? `${fmtGrams(cur.avg.carbs)} g` : '–', prev.avg ? `${fmtGrams(prev.avg.carbs)} g` : '–', diff(cur.avg?.carbs, prev.avg?.carbs, 'g')],
    ['Avg fat', cur.avg ? `${fmtGrams(cur.avg.fat)} g` : '–', prev.avg ? `${fmtGrams(prev.avg.fat)} g` : '–', diff(cur.avg?.fat, prev.avg?.fat, 'g')],
    ['Avg fiber', cur.avg ? `${fmtGrams(cur.avg.fiber)} g` : '–', prev.avg ? `${fmtGrams(prev.avg.fiber)} g` : '–', diff(cur.avg?.fiber, prev.avg?.fiber, 'g')],
    ['Days logged', `${cur.daysLogged}/${cur.days}`, `${prev.daysLogged}/${prev.days}`, diff(cur.daysLogged, prev.daysLogged, 'days')],
    ['Within 10% of calorie target', cur.adherence ? `${cur.adherence.calorieDays}/${cur.adherence.counted} days` : '–', prev.adherence ? `${prev.adherence.calorieDays}/${prev.adherence.counted} days` : '–', ''],
    ['Protein target met', cur.adherence ? `${cur.adherence.proteinDays}/${cur.adherence.counted} days` : '–', prev.adherence ? `${prev.adherence.proteinDays}/${prev.adherence.counted} days` : '–', ''],
    ['Workouts', String(cur.workouts), String(prev.workouts), diff(cur.workouts, prev.workouts, '')],
    ['Exercise minutes', String(Math.round(cur.exerciseMinutes)), String(Math.round(prev.exerciseMinutes)), diff(cur.exerciseMinutes, prev.exerciseMinutes, 'min')],
    ['Weight change', weightChange === null ? '–' : `${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)} lb`, '', ''],
  ];
  return (
    <div className="table-scroll">
      <table className="mini-table summary-table">
        <thead>
          <tr>
            <th scope="col">Measure</th>
            <th scope="col">This range</th>
            <th scope="col">Previous ({prevLabel})</th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, a, b, c]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td>{a}</td>
              <td>{b}</td>
              <td>{c}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
