import { useMemo } from 'react';
import { useApp } from '../state';
import type { FoodEntry } from '../lib/types';
import { MEALS, MEAL_LABEL } from '../lib/types';
import { dailyTotals, fmtGrams, fmtKcal, itemsTotals, remainingBudget } from '../lib/nutrition';
import { addDays, formatDate, nowIso, toDateKey } from '../lib/dates';
import { weightStats } from '../lib/weight';
import { Empty, Icon, Meter, Section } from '../components/ui';
import { formatQuantity, unitLabel } from '../lib/units';
import * as db from '../lib/db';
import { fmtLb } from './Weight';

export function Dashboard() {
  const { data, selectedDate, setSelectedDate, go, setFoodIntent, reload } = useApp();
  const d = data!;
  const t = d.profile.targets;
  const today = toDateKey();
  const date = selectedDate;
  const entries = useMemo(() => d.food.filter((e) => e.date === date).sort((a, b) => a.time.localeCompare(b.time)), [d.food, date]);
  const totals = dailyTotals(d.food, date);
  const remaining = remainingBudget(t.calories, totals.calories);
  const workouts = d.exercise.filter((e) => e.date === date);
  const exKcal = workouts.reduce((a, e) => a + e.estimatedCalories, 0);
  const exMin = workouts.reduce((a, e) => a + e.durationMin, 0);
  const ws = weightStats(d.weights, d.profile);
  const status = d.days.find((s) => s.date === date);
  const complete = !!status?.complete;

  const logFood = () => {
    setFoodIntent({ date });
    go('food');
  };
  const editEntry = (e: FoodEntry) => {
    setFoodIntent({ editEntryId: e.id, date: e.date });
    go('food');
  };
  async function toggleComplete() {
    const now = nowIso();
    await db.put('dayStatus', { id: `${d.profile.id}|${date}`, profileId: d.profile.id, date, complete: !complete, createdAt: status?.createdAt ?? now, updatedAt: now });
    await reload();
  }

  return (
    <div className="stack">
      <div className="date-nav">
        <button className="icon-btn" onClick={() => setSelectedDate(addDays(date, -1))} aria-label="Previous day">
          <Icon name="left" />
        </button>
        <div className="date-nav-label">
          <h1>{date === today ? 'Today' : date === addDays(today, -1) ? 'Yesterday' : formatDate(date, { weekday: 'long' })}</h1>
          <span className="muted">{formatDate(date, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </div>
        <button className="icon-btn" onClick={() => setSelectedDate(addDays(date, 1))} aria-label="Next day" disabled={date >= today}>
          <Icon name="right" />
        </button>
      </div>
      {date !== today && (
        <button className="link center" onClick={() => setSelectedDate(today)}>
          Back to today
        </button>
      )}

      <section className="label-panel" aria-label="Daily nutrition">
        <div className="label-cal">
          <div>
            <span className="label-k">Calories eaten</span>
            <span className="label-big">{entries.length ? fmtKcal(totals.calories) : '–'}</span>
          </div>
          <div className="label-right">
            <span className="label-k">{remaining >= 0 ? 'Left' : 'Over'}</span>
            <span className="label-mid">{entries.length ? fmtKcal(Math.abs(remaining)) : fmtKcal(t.calories)}</span>
            <span className="muted small">of {fmtKcal(t.calories)} target</span>
          </div>
        </div>
        <Meter value={totals.calories} max={t.calories} label="Calories" tone="ink" detail={`${fmtKcal(totals.calories)} / ${fmtKcal(t.calories)}`} />
        <div className="label-rule" />
        <div className="protein-row">
          <Meter value={totals.protein} max={t.protein} label="Protein" tone="protein" detail={<><strong>{fmtGrams(totals.protein)}</strong> / {fmtGrams(t.protein)} g{totals.protein < t.protein ? `, ${fmtGrams(t.protein - totals.protein)} g to go` : ', target met'}</>} />
        </div>
        <Meter value={totals.carbs} max={t.carbs} label="Carbohydrates" tone="carbs" detail={`${fmtGrams(totals.carbs)} / ${fmtGrams(t.carbs)} g`} />
        <Meter value={totals.fat} max={t.fat} label="Fat" tone="fat" detail={`${fmtGrams(totals.fat)} / ${fmtGrams(t.fat)} g`} />
        <Meter value={totals.fiber} max={t.fiber} label="Fiber" tone="fiber" detail={`${fmtGrams(totals.fiber)} / ${fmtGrams(t.fiber)} g`} />
        <div className="label-rule thin" />
        <div className="label-foot">
          <span>
            Exercise, est. net: <strong>{workouts.length ? `${fmtKcal(exKcal)} kcal, ${Math.round(exMin)} min` : 'none logged'}</strong>
          </span>
          <span className="muted small">Not added to your food budget.</span>
        </div>
      </section>

      <button className="btn btn-primary btn-big" onClick={() => logFood()}>
        <Icon name="plus" /> Log food
      </button>

      {entries.length === 0 ? (
        <Empty title={date === today ? 'Nothing logged yet today' : 'Nothing logged for this day'}>Days without entries count as not logged, not as zero calories.</Empty>
      ) : (
        MEALS.map((m) => {
          const list = entries.filter((e) => e.meal === m);
          if (!list.length) return null;
          const mt = list.reduce((a, e) => a + itemsTotals(e.items).calories, 0);
          return (
            <Section key={m} title={MEAL_LABEL[m]} action={<span className="muted">{fmtKcal(mt)} kcal</span>}>
              <ul className="entry-list">
                {list.map((e) => (
                  <li key={e.id}>
                    <button className="entry" onClick={() => editEntry(e)} aria-label={`Edit ${MEAL_LABEL[m]} entry at ${e.time}`}>
                      {e.items.map((i) => (
                        <span key={i.id} className="entry-item">
                          <span className="entry-name">
                            {i.name}
                            <span className="muted">
                              {' '}
                              {formatQuantity(i.quantity)} {unitLabel(i.unit, i.quantity)}
                              {i.estimated ? ', est.' : ''}
                            </span>
                          </span>
                          <span className="entry-kcal">{fmtKcal(i.nutrients.calories)}</span>
                          <span className="entry-macros muted">
                            P {fmtGrams(i.nutrients.protein)} C {fmtGrams(i.nutrients.carbs)} F {fmtGrams(i.nutrients.fat)}
                          </span>
                        </span>
                      ))}
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          );
        })
      )}

      {entries.length > 0 && (
        <label className="check day-complete">
          <input type="checkbox" checked={complete} onChange={() => void toggleComplete()} /> I’ve logged everything for this day
        </label>
      )}

      <Section title="Workouts" action={<button className="link" onClick={() => go('exercise')}>Add</button>}>
        {workouts.length ? (
          <ul className="plain-list">
            {workouts.map((w) => (
              <li key={w.id}>
                {w.name}, {Math.round(w.durationMin)} min{w.distanceMi ? `, ${w.distanceMi} mi` : ''} <span className="muted">≈ {fmtKcal(w.estimatedCalories)} kcal net</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No workouts logged for this day.</p>
        )}
      </Section>

      <Section title="Weight goal" action={<button className="link" onClick={() => go('weight')}>Weigh in</button>}>
        {ws.latest === null ? (
          <p className="muted">No weigh-ins yet.</p>
        ) : (
          <>
            <Meter
              value={ws.percentComplete ?? 0}
              max={100}
              label={`${fmtLb(ws.latest)} lb now, target ${fmtLb(ws.target)} lb`}
              tone="ink"
              detail={ws.percentComplete === null ? '' : `${Math.round(ws.percentComplete)}%`}
            />
            <p className="muted small">
              {ws.change! <= 0 ? `${Math.abs(ws.change!).toFixed(1)} lb lost` : `${ws.change!.toFixed(1)} lb gained`} since {fmtLb(ws.start)} lb, {ws.remaining!.toFixed(1)} lb to go. Last weigh-in {formatDate(ws.latestDate!, { month: 'short', day: 'numeric' })}.
            </p>
          </>
        )}
      </Section>
    </div>
  );
}
