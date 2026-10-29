import { useMemo, useState } from 'react';
import { useApp } from '../state';
import type { ExerciseEntry, Intensity } from '../lib/types';
import { ACTIVITIES, ACTIVITY_BY_KEY, estimateExercise } from '../lib/exercise';
import { addDays, formatDate, isValidDateKey, nowIso, startOfWeek, toDateKey } from '../lib/dates';
import { fmtKcal } from '../lib/nutrition';
import { uid } from '../lib/id';
import * as db from '../lib/db';
import { Confirm, Empty, Field, Icon, NumberInput, Section, Segmented } from '../components/ui';
import { BarChart } from '../components/Charts';
import { latestWeight } from './Weight';

export function ExerciseScreen() {
  const { data, reload, toast } = useApp();
  const d = data!;
  const weight = latestWeight(d.weights) ?? d.profile.currentWeight;
  const [editing, setEditing] = useState<ExerciseEntry | null>(null);
  const [activity, setActivity] = useState('walking');
  const [name, setName] = useState('');
  const [date, setDate] = useState(toDateKey());
  const [duration, setDuration] = useState<number | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [intensity, setIntensity] = useState<Intensity>('moderate');
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState(false);
  const [toDelete, setToDelete] = useState<ExerciseEntry | null>(null);

  const def = ACTIVITY_BY_KEY[activity];
  const est = duration ? estimateExercise(activity, duration, weight, intensity, def.usesDistance ? distance ?? undefined : undefined) : null;
  const nameErr = activity === 'other' && !name.trim() ? 'Name the activity.' : null;
  const durErr = !duration || duration <= 0 || duration > 1440 ? 'Enter minutes, from 1 to 1,440.' : null;
  const dateErr = !isValidDateKey(date) || date > toDateKey() ? 'Choose today or an earlier date.' : null;

  function reset() {
    setEditing(null);
    setName('');
    setDuration(null);
    setDistance(null);
    setNotes('');
    setTouched(false);
  }

  function edit(e: ExerciseEntry) {
    setEditing(e);
    setActivity(ACTIVITY_BY_KEY[e.activity] ? e.activity : 'other');
    setName(e.activity === 'other' || e.name !== ACTIVITY_BY_KEY[e.activity]?.label ? e.name : '');
    setDate(e.date);
    setDuration(e.durationMin);
    setDistance(e.distanceMi ?? null);
    setIntensity(e.intensity ?? 'moderate');
    setNotes(e.notes ?? '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save() {
    setTouched(true);
    if (nameErr || durErr || dateErr || !est) return;
    const now = nowIso();
    const entry: ExerciseEntry = {
      id: editing?.id ?? uid(),
      profileId: d.profile.id,
      date,
      activity,
      name: name.trim() || def.label,
      durationMin: duration!,
      distanceMi: def.usesDistance && distance ? distance : undefined,
      intensity,
      estimatedCalories: est.calories,
      estimationMethod: est.method,
      notes: notes.trim() || undefined,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.put('exerciseEntries', entry);
    await reload();
    toast(editing ? 'Workout updated' : 'Workout saved');
    reset();
  }

  const today = toDateKey();
  const sorted = useMemo(() => [...d.exercise].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)), [d.exercise]);
  const todays = sorted.filter((e) => e.date === today);
  const week0 = startOfWeek(today);
  const thisWeek = d.exercise.filter((e) => e.date >= week0);
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(week0, -7 * (7 - i)));
  const weekly = weeks.map((w) => {
    const list = d.exercise.filter((e) => e.date >= w && e.date <= addDays(w, 6));
    return { label: formatDate(w, { month: 'numeric', day: 'numeric' }), value: list.reduce((a, e) => a + e.durationMin, 0), detail: `${list.length} workout${list.length === 1 ? '' : 's'}` };
  });

  return (
    <div className="stack">
      <h1>Exercise</h1>
      <Section title={editing ? 'Edit workout' : 'Add a workout'}>
        <form
          className="stack-tight"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label="Activity" htmlFor="ex-act">
            <select id="ex-act" value={activity} onChange={(e) => setActivity(e.target.value)}>
              {ACTIVITIES.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={activity === 'other' ? 'Activity name' : 'Name (optional)'} htmlFor="ex-name" error={touched ? nameErr : null}>
            <input id="ex-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={activity === 'other' ? 'Kayaking' : def.label} />
          </Field>
          <div className="grid2">
            <Field label="Date" htmlFor="ex-date" error={touched ? dateErr : null}>
              <input id="ex-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Duration" htmlFor="ex-dur" error={touched ? durErr : null}>
              <NumberInput id="ex-dur" value={duration} onChange={setDuration} max={1440} suffix="min" />
            </Field>
          </div>
          {def.usesDistance && (
            <Field label="Distance (optional)" htmlFor="ex-dist" hint="With duration, sets intensity from your average speed.">
              <NumberInput id="ex-dist" value={distance} onChange={setDistance} max={500} suffix="mi" />
            </Field>
          )}
          <Field label="Intensity">
            <Segmented label="Intensity" value={intensity} onChange={setIntensity} options={[{ value: 'light', label: 'Light' }, { value: 'moderate', label: 'Moderate' }, { value: 'vigorous', label: 'Vigorous' }]} />
          </Field>
          <Field label="Notes (optional)" htmlFor="ex-notes">
            <input id="ex-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <p className="estimate" aria-live="polite">
            {est ? (
              <>
                About <strong>{fmtKcal(est.calories)} kcal</strong> above resting, based on {Math.round(weight)} lb. <span className="muted small">{est.method}.</span>
              </>
            ) : (
              <span className="muted">Enter a duration to see the estimate.</span>
            )}
          </p>
          <p className="hint">Estimates use published MET values, not a heart-rate monitor, and can be off by 20% or more. They’re shown for reference and don’t change your food budget.</p>
          <div className="actions">
            {editing && (
              <button type="button" className="btn" onClick={reset}>
                Cancel edit
              </button>
            )}
            <button type="submit" className="btn btn-primary">
              {editing ? 'Save changes' : 'Save workout'}
            </button>
          </div>
        </form>
      </Section>

      <Section title="Today">
        {todays.length ? <ExerciseList list={todays} onEdit={edit} onDelete={setToDelete} /> : <p className="muted">No workouts today.</p>}
      </Section>

      <Section title="This week">
        <p>
          {thisWeek.length} workout{thisWeek.length === 1 ? '' : 's'}, {Math.round(thisWeek.reduce((a, e) => a + e.durationMin, 0))} min, about {fmtKcal(thisWeek.reduce((a, e) => a + e.estimatedCalories, 0))} kcal net
        </p>
        <BarChart title="Minutes per week" unit="min" data={weekly} tone="protein" />
      </Section>

      <Section title="History">
        {sorted.length ? <ExerciseList list={sorted.slice(0, 40)} onEdit={edit} onDelete={setToDelete} showDate /> : <Empty title="No workouts yet">Log one above and it will show here.</Empty>}
      </Section>

      {toDelete && (
        <Confirm
          title="Delete this workout?"
          message={`${toDelete.name} on ${formatDate(toDelete.date)}.`}
          confirmLabel="Delete workout"
          danger
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            await db.remove('exerciseEntries', toDelete.id);
            setToDelete(null);
            await reload();
            toast('Workout deleted');
          }}
        />
      )}
    </div>
  );
}

function ExerciseList({ list, onEdit, onDelete, showDate }: { list: ExerciseEntry[]; onEdit: (e: ExerciseEntry) => void; onDelete: (e: ExerciseEntry) => void; showDate?: boolean }) {
  return (
    <ul className="row-list">
      {list.map((e) => (
        <li key={e.id}>
          <button className="row-main" onClick={() => onEdit(e)}>
            <span>
              <strong>{e.name}</strong>
              {showDate && <span className="muted"> {formatDate(e.date, { month: 'short', day: 'numeric' })}</span>}
            </span>
            <span className="muted small">
              {Math.round(e.durationMin)} min{e.distanceMi ? `, ${e.distanceMi} mi` : ''}
              {e.intensity ? `, ${e.intensity}` : ''}, ≈ {fmtKcal(e.estimatedCalories)} kcal net
            </span>
          </button>
          <button className="icon-btn" onClick={() => onDelete(e)} aria-label={`Delete ${e.name}`}>
            <Icon name="trash" size={18} />
          </button>
        </li>
      ))}
    </ul>
  );
}
