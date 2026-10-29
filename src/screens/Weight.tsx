import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state';
import type { Profile, WeightEntry } from '../lib/types';
import { addDays, daysBetween, formatDate, isValidDateKey, nowIso, toDateKey } from '../lib/dates';
import { linearTrend, projectTargetDate, recommendAdjustment, sortWeights, weightStats } from '../lib/weight';
import { uid } from '../lib/id';
import * as db from '../lib/db';
import { Confirm, Empty, Field, Icon, Meter, NumberInput, Section } from '../components/ui';
import { LineChart } from '../components/Charts';
import type { LineSeries } from '../components/Charts';
import { TargetSummary } from './Profile';

export function latestWeight(ws: WeightEntry[]): number | null {
  const s = sortWeights(ws);
  return s.length ? s[s.length - 1].weight : null;
}

/** Nearest actual weigh-in about `days` before `ref`, within a tolerance. Never interpolated. */
function weighInNear(ws: WeightEntry[], ref: string, days: number, tol: number): WeightEntry | null {
  const target = addDays(ref, -days);
  let best: WeightEntry | null = null;
  for (const w of ws) {
    const off = Math.abs(daysBetween(w.date, target));
    if (off <= tol && w.date < ref && (!best || off < Math.abs(daysBetween(best.date, target)))) best = w;
  }
  return best;
}

export function WeightScreen() {
  const { data, reload, toast, go } = useApp();
  const d = data!;
  const p = d.profile;
  const today = toDateKey();
  const [date, setDate] = useState(today);
  const [weight, setWeight] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState(false);
  const [toDelete, setToDelete] = useState<WeightEntry | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  const sorted = useMemo(() => sortWeights(d.weights), [d.weights]);
  const stats = weightStats(sorted, p);
  const trend = linearTrend(sorted);
  const latest = sorted[sorted.length - 1];
  // the most recent change of calorie targets, ignoring the initial setup
  const lastChange = [...d.goals].filter((g) => g.reason !== 'Initial setup').sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0]?.effectiveDate;
  const rec = recommendAdjustment(sorted, p, p.targets, today, lastChange);
  const projected = trend && latest ? projectTargetDate(trend, latest.date, p.targetWeight) : null;
  const weekAgo = latest ? weighInNear(sorted, latest.date, 7, 3) : null;
  const monthAgo = latest ? weighInNear(sorted, latest.date, 30, 7) : null;

  useEffect(() => {
    void db.getSetting<string | null>(`dismissedRec:${p.id}`, null).then(setDismissedFor);
  }, [p.id]);

  const wErr = weight === null || weight < 70 || weight > 700 ? 'Enter a weight from 70 to 700 lb.' : null;
  const dErr = !isValidDateKey(date) || date > today ? 'Choose today or an earlier date.' : null;
  const sameDay = sorted.find((w) => w.date === date);

  async function syncCurrent(ws: WeightEntry[]) {
    const lw = latestWeight(ws);
    if (lw !== null && lw !== p.currentWeight) {
      const next: Profile = { ...p, currentWeight: lw, updatedAt: nowIso() };
      await db.put('profiles', next);
    }
  }

  async function save() {
    setTouched(true);
    if (wErr || dErr) return;
    const now = nowIso();
    const entry: WeightEntry = { id: uid(), profileId: p.id, date, weight: Math.round(weight! * 10) / 10, notes: notes.trim() || undefined, createdAt: now, updatedAt: now };
    await db.put('weightEntries', entry);
    await syncCurrent([...sorted, entry]);
    await reload();
    toast('Weigh-in saved');
    setWeight(null);
    setNotes('');
    setTouched(false);
  }

  async function acceptRec() {
    if (!rec.suggested) return;
    const now = nowIso();
    await db.putMany({
      profiles: [{ ...p, targets: rec.suggested, updatedAt: now }],
      goalHistory: [{ id: uid(), profileId: p.id, effectiveDate: today, targets: rec.suggested, targetWeight: p.targetWeight, weeklyRate: p.weeklyRate, reason: `Accepted suggestion: ${rec.delta! > 0 ? '+' : ''}${rec.delta} kcal (${rec.status === 'too_slow' ? 'loss slower than planned' : 'loss faster than planned'})`, createdAt: now, updatedAt: now }],
    });
    await reload();
    toast('Targets updated');
  }

  async function dismissRec() {
    if (!latest) return;
    await db.setSetting(`dismissedRec:${p.id}`, latest.id);
    setDismissedFor(latest.id);
  }

  // chart
  const origin = sorted[0]?.date ?? today;
  const series: LineSeries[] = [];
  if (sorted.length) {
    series.push({ name: 'Weigh-ins', kind: 'actual', points: sorted.map((w) => ({ x: daysBetween(origin, w.date), y: w.weight, label: formatDate(w.date, { month: 'short', day: 'numeric' }) })) });
    const end = latest.date;
    series.push({ name: `Target ${p.targetWeight} lb`, kind: 'target', points: [{ x: 0, y: p.targetWeight, label: '' }, { x: Math.max(1, daysBetween(origin, end)), y: p.targetWeight, label: '' }] });
    if (trend) {
      series.push({ name: 'Trend (fitted line)', kind: 'trend', points: [origin, end].map((dt) => ({ x: daysBetween(origin, dt), y: trend.valueAt(dt), label: '' })) });
    }
  }
  const span = sorted.length ? Math.max(1, daysBetween(origin, latest.date)) : 1;
  const xLabels = sorted.length ? [0, Math.round(span / 2), span].map((x) => ({ x, label: formatDate(addDays(origin, x), { month: 'short', day: 'numeric' }) })) : [];

  const showRec = rec.status !== 'insufficient' && !(latest && dismissedFor === latest.id);

  return (
    <div className="stack">
      <h1>Weight</h1>
      <section className="stat-row" aria-label="Weight summary">
        <div>
          <span className="stat-k">Current</span>
          <span className="stat-v">{stats.latest === null ? '–' : fmtLb(stats.latest)}</span>
          <span className="stat-u">lb</span>
        </div>
        <div>
          <span className="stat-k">Target</span>
          <span className="stat-v">{fmtLb(p.targetWeight)}</span>
          <span className="stat-u">lb</span>
        </div>
        <div>
          <span className="stat-k">{stats.change !== null && stats.change > 0 ? 'Gained' : 'Lost'}</span>
          <span className="stat-v">{stats.change === null ? '–' : Math.abs(stats.change).toFixed(1)}</span>
          <span className="stat-u">lb since {fmtLb(p.startingWeight)}</span>
        </div>
        <div>
          <span className="stat-k">To go</span>
          <span className="stat-v">{stats.remaining === null ? '–' : stats.remaining.toFixed(1)}</span>
          <span className="stat-u">lb</span>
        </div>
      </section>
      {stats.percentComplete !== null && <Meter value={stats.percentComplete} max={100} label="Goal progress" detail={`${Math.round(stats.percentComplete)}%`} />}

      <Section title="Add a weigh-in">
        <form
          className="stack-tight"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid2">
            <Field label="Weight" htmlFor="w-val" error={touched ? wErr : null}>
              <NumberInput id="w-val" value={weight} onChange={setWeight} suffix="lb" />
            </Field>
            <Field label="Date" htmlFor="w-date" error={touched ? dErr : null}>
              <input id="w-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Notes (optional)" htmlFor="w-notes">
            <input id="w-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Morning, after coffee" />
          </Field>
          {sameDay && <p className="hint">There’s already a weigh-in on this date ({fmtLb(sameDay.weight)} lb). Both will be kept; delete one below if it was a mistake.</p>}
          <div className="actions">
            <button type="submit" className="btn btn-primary">
              Save weigh-in
            </button>
          </div>
          <p className="hint">Weekly weigh-ins are enough. Same scale, same time of day keeps the trend cleaner.</p>
        </form>
      </Section>

      <Section title="History">
        <LineChart series={series} title="Weight" unit="lb" xLabels={xLabels} />
        <dl className="compare">
          <div>
            <dt>Since about a week earlier</dt>
            <dd>{latest && weekAgo ? `${fmtChange(latest.weight - weekAgo.weight)} (vs ${formatDate(weekAgo.date, { month: 'short', day: 'numeric' })})` : 'No weigh-in around then'}</dd>
          </div>
          <div>
            <dt>Since about a month earlier</dt>
            <dd>{latest && monthAgo ? `${fmtChange(latest.weight - monthAgo.weight)} (vs ${formatDate(monthAgo.date, { month: 'short', day: 'numeric' })})` : 'No weigh-in around then'}</dd>
          </div>
          <div>
            <dt>Trend</dt>
            <dd>{trend ? `${fmtChange(trend.slopePerWeek)} per week over ${trend.n} weigh-ins` : `Needs 3 weigh-ins over at least 2 weeks (${sorted.length} so far)`}</dd>
          </div>
          <div>
            <dt>Projected target date</dt>
            <dd>{projected ? `${formatDate(projected, { month: 'short', day: 'numeric', year: 'numeric' })} if the current trend holds. A projection, not a promise.` : trend ? 'Not heading toward the target at the current trend' : 'Not enough data yet'}</dd>
          </div>
        </dl>
      </Section>

      <Section title="Target check">
        {rec.status === 'insufficient' || !showRec ? (
          <p className="muted">{rec.status === 'insufficient' ? rec.rationale : 'Suggestion dismissed. It will come back after your next weigh-in.'}</p>
        ) : (
          <div className={`rec rec-${rec.status}`}>
            <p>{rec.rationale}</p>
            {rec.suggested && (
              <>
                <p>
                  <strong>Suggested:</strong> {Math.round(p.targets.calories).toLocaleString()} → {Math.round(rec.suggested.calories).toLocaleString()} kcal per day, protein unchanged.
                </p>
                <TargetSummary t={rec.suggested} />
                <div className="row-wrap">
                  <button className="btn btn-primary" onClick={() => void acceptRec()}>
                    Accept
                  </button>
                  <button className="btn" onClick={() => go('goals')}>
                    Edit targets myself
                  </button>
                  <button className="btn" onClick={() => void dismissRec()}>
                    Not now
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </Section>

      <Section title="All weigh-ins">
        {sorted.length ? (
          <ul className="row-list">
            {[...sorted].reverse().map((w) => (
              <li key={w.id}>
                <span className="row-main static">
                  <span>
                    <strong>{fmtLb(w.weight)} lb</strong> <span className="muted">{formatDate(w.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </span>
                  {w.notes && <span className="muted small">{w.notes}</span>}
                </span>
                <button className="icon-btn" onClick={() => setToDelete(w)} aria-label={`Delete weigh-in of ${w.weight} lb on ${w.date}`}>
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No weigh-ins yet" />
        )}
      </Section>

      {toDelete && (
        <Confirm
          title="Delete this weigh-in?"
          message={`${fmtLb(toDelete.weight)} lb on ${formatDate(toDelete.date)}.`}
          confirmLabel="Delete weigh-in"
          danger
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            await db.remove('weightEntries', toDelete.id);
            await syncCurrent(sorted.filter((w) => w.id !== toDelete.id));
            setToDelete(null);
            await reload();
            toast('Weigh-in deleted');
          }}
        />
      )}
    </div>
  );
}

export function fmtLb(v: number): string {
  return String(Math.round(v * 10) / 10);
}

function fmtChange(v: number): string {
  if (Math.abs(v) < 0.05) return 'no change';
  return `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} lb`;
}
