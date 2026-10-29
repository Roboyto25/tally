import { useMemo, useState } from 'react';
import type { ActivityLevel, GoalRecord, Profile, Sex, Targets } from '../lib/types';
import { ACTIVITY, WEEKLY_RATES, computeTargets, consistencyWarning, macrosFor } from '../lib/targets';
import { useApp } from '../state';
import * as db from '../lib/db';
import { uid } from '../lib/id';
import { nowIso, toDateKey, formatDate } from '../lib/dates';
import { DEFAULT_BOUNDARIES } from '../lib/parser';
import { Field, NumberInput, Section, Confirm } from '../components/ui';

interface FormState {
  name: string;
  age: number | null;
  sex: Sex;
  feet: number | null;
  inches: number | null;
  current: number | null;
  target: number | null;
  rate: number;
  activity: ActivityLevel;
  prefCalories: number | null;
  prefProtein: number | null;
}

function fromProfile(p?: Profile, name = ''): FormState {
  if (!p) return { name, age: null, sex: 'male', feet: null, inches: null, current: null, target: null, rate: 0.5, activity: 'light', prefCalories: null, prefProtein: null };
  return {
    name: p.name,
    age: p.age,
    sex: p.sex,
    feet: Math.floor(p.heightIn / 12),
    inches: Math.round((p.heightIn % 12) * 10) / 10,
    current: p.currentWeight,
    target: p.targetWeight,
    rate: p.weeklyRate,
    activity: p.activityLevel,
    prefCalories: null,
    prefProtein: null,
  };
}

export function ProfileForm({ existing, suggestedName, onDone, onCancel }: { existing?: Profile; suggestedName?: string; onDone: (p: Profile) => void; onCancel?: () => void }) {
  const { toast } = useApp();
  const [f, setF] = useState<FormState>(fromProfile(existing, suggestedName));
  const [startWeight, setStartWeight] = useState<number | null>(existing?.startingWeight ?? null);
  const [recordWeigh, setRecordWeigh] = useState(!existing);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  const heightIn = f.feet !== null ? f.feet * 12 + (f.inches ?? 0) : null;
  const errors = {
    name: !f.name.trim() ? 'Enter a name.' : null,
    age: f.age === null || f.age < 13 || f.age > 100 ? 'Enter an age from 13 to 100.' : null,
    height: heightIn === null || heightIn < 48 || heightIn > 90 ? 'Enter a height between 4 ft and 7 ft 6 in.' : null,
    current: f.current === null || f.current < 70 || f.current > 700 ? 'Enter a weight from 70 to 700 lb.' : null,
    target: f.target === null || f.target < 70 || f.target > 700 ? 'Enter a target from 70 to 700 lb.' : null,
  };
  const valid = Object.values(errors).every((e) => !e);

  const calc = useMemo(() => {
    if (!valid) return null;
    return computeTargets({
      sex: f.sex,
      age: f.age!,
      heightIn: heightIn!,
      weightLb: f.current!,
      targetWeightLb: f.target!,
      weeklyRate: f.rate,
      activity: f.activity,
      preferredCalories: f.prefCalories ?? undefined,
      preferredProtein: f.prefProtein ?? undefined,
    });
  }, [valid, f, heightIn]);

  async function save() {
    setTouched(true);
    if (!valid || !calc) return;
    setSaving(true);
    try {
      const now = nowIso();
      const targets = existing && !f.prefCalories && !f.prefProtein && !targetsInputsChanged(existing, f, heightIn!) ? existing.targets : calc.targets;
      const profile: Profile = {
        id: existing?.id ?? uid(),
        name: f.name.trim(),
        age: f.age!,
        sex: f.sex,
        heightIn: heightIn!,
        startingWeight: existing ? startWeight ?? existing.startingWeight : f.current!,
        currentWeight: f.current!,
        targetWeight: f.target!,
        weeklyRate: f.rate,
        activityLevel: f.activity,
        targets,
        mealBoundaries: existing?.mealBoundaries ?? { ...DEFAULT_BOUNDARIES },
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      const writes: Record<string, unknown[]> = { profiles: [profile] };
      if (!existing || JSON.stringify(existing.targets) !== JSON.stringify(targets) || existing.targetWeight !== profile.targetWeight || existing.weeklyRate !== profile.weeklyRate) {
        const g: GoalRecord = { id: uid(), profileId: profile.id, effectiveDate: toDateKey(), targets, targetWeight: profile.targetWeight, weeklyRate: profile.weeklyRate, reason: existing ? 'Profile updated' : 'Initial setup', createdAt: now, updatedAt: now };
        writes.goalHistory = [g];
      }
      if (recordWeigh) writes.weightEntries = [{ id: uid(), profileId: profile.id, date: toDateKey(), weight: f.current!, notes: existing ? undefined : 'Starting weight', createdAt: now, updatedAt: now }];
      await db.putMany(writes as never);
      void db.requestPersistence();
      onDone(profile);
    } catch (e) {
      toast(`Couldn’t save: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  }

  const err = (k: keyof typeof errors) => (touched ? errors[k] : null);

  return (
    <form
      className="stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Section title="About you">
        <div className="grid2">
          <Field label="Name" htmlFor="pf-name" error={err('name')}>
            <input id="pf-name" value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Age" htmlFor="pf-age" error={err('age')}>
            <NumberInput id="pf-age" value={f.age} onChange={(v) => set('age', v)} max={120} />
          </Field>
        </div>
        <Field label="Sex used by the energy equation" hint="Mifflin–St Jeor uses a different constant for each. This only affects the calorie estimate.">
          <div className="radio-row">
            {(['male', 'female'] as Sex[]).map((s) => (
              <label key={s} className="radio">
                <input type="radio" name="sex" checked={f.sex === s} onChange={() => set('sex', s)} /> {s === 'male' ? 'Male' : 'Female'}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Height" error={err('height')}>
          <div className="inline-inputs">
            <NumberInput label="Feet" value={f.feet} onChange={(v) => set('feet', v)} max={8} suffix="ft" />
            <NumberInput label="Inches" value={f.inches} onChange={(v) => set('inches', v)} max={11.9} suffix="in" />
          </div>
        </Field>
      </Section>

      <Section title="Goal">
        <div className="grid2">
          <Field label="Current weight" htmlFor="pf-cur" error={err('current')}>
            <NumberInput id="pf-cur" value={f.current} onChange={(v) => set('current', v)} suffix="lb" />
          </Field>
          <Field label="Target weight" htmlFor="pf-tgt" error={err('target')}>
            <NumberInput id="pf-tgt" value={f.target} onChange={(v) => set('target', v)} suffix="lb" />
          </Field>
        </div>
        {existing && (
          <Field label="Starting weight" htmlFor="pf-start" hint="Progress toward the goal is measured from here.">
            <NumberInput id="pf-start" value={startWeight} onChange={setStartWeight} suffix="lb" />
          </Field>
        )}
        <Field label="Weekly loss rate" htmlFor="pf-rate" hint="0.5–1 lb a week is a common, sustainable pace.">
          <select id="pf-rate" value={f.rate} onChange={(e) => set('rate', Number(e.target.value))}>
            {WEEKLY_RATES.map((r) => (
              <option key={r} value={r}>
                {r === 0 ? 'Maintain weight' : `${r} lb per week`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Activity level" htmlFor="pf-act" hint={ACTIVITY[f.activity].detail}>
          <select id="pf-act" value={f.activity} onChange={(e) => set('activity', e.target.value as ActivityLevel)}>
            {(Object.keys(ACTIVITY) as ActivityLevel[]).map((a) => (
              <option key={a} value={a}>
                {ACTIVITY[a].label}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid2">
          <Field label="Calorie target, if you have one" htmlFor="pf-pc" hint="Leave blank to calculate.">
            <NumberInput id="pf-pc" value={f.prefCalories} onChange={(v) => set('prefCalories', v)} suffix="kcal" />
          </Field>
          <Field label="Protein target, if you have one" htmlFor="pf-pp" hint="Leave blank to calculate.">
            <NumberInput id="pf-pp" value={f.prefProtein} onChange={(v) => set('prefProtein', v)} suffix="g" />
          </Field>
        </div>
        {existing && (
          <p className="hint">Saving keeps your current calorie and macro targets unless you change weight, goal, activity, or enter a target above. Edit targets directly in Goals.</p>
        )}
      </Section>

      {calc && (
        <Section title="Starting targets">
          <TargetSummary t={calc.targets} />
          <p className="hint">
            Resting energy {Math.round(calc.bmr).toLocaleString()} kcal (Mifflin–St Jeor) × activity {ACTIVITY[f.activity].multiplier} ≈ {Math.round(calc.tdee).toLocaleString()} kcal maintenance
            {calc.dailyDeficit > 0 ? `, minus ${Math.round(calc.dailyDeficit)} kcal/day for ${f.rate} lb/week (3,500 kcal ≈ 1 lb).` : '.'} These are estimates, not a medical prescription. The weekly weigh-ins will show whether they need adjusting.
          </p>
          {calc.warnings.map((w) => (
            <p key={w} className="warn" role="status">
              {w}
            </p>
          ))}
        </Section>
      )}

      {existing && (
        <label className="check">
          <input type="checkbox" checked={recordWeigh} onChange={(e) => setRecordWeigh(e.target.checked)} /> Also record {f.current ?? '–'} lb as today’s weigh-in
        </label>
      )}
      {!existing && <p className="hint">Your current weight is saved as today’s first weigh-in.</p>}

      <div className="actions">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {existing ? 'Save profile' : 'Create profile'}
        </button>
      </div>
    </form>
  );
}

function targetsInputsChanged(p: Profile, f: FormState, heightIn: number): boolean {
  return p.age !== f.age || p.sex !== f.sex || p.heightIn !== heightIn || p.currentWeight !== f.current || p.targetWeight !== f.target || p.weeklyRate !== f.rate || p.activityLevel !== f.activity;
}

export function TargetSummary({ t }: { t: Targets }) {
  return (
    <dl className="target-summary">
      <div>
        <dt>Calories</dt>
        <dd>{Math.round(t.calories).toLocaleString()}</dd>
      </div>
      <div className="protein">
        <dt>Protein</dt>
        <dd>{Math.round(t.protein)} g</dd>
      </div>
      <div>
        <dt>Carbs</dt>
        <dd>{Math.round(t.carbs)} g</dd>
      </div>
      <div>
        <dt>Fat</dt>
        <dd>{Math.round(t.fat)} g</dd>
      </div>
      <div>
        <dt>Fiber</dt>
        <dd>{Math.round(t.fiber)} g</dd>
      </div>
    </dl>
  );
}

// ---------- first run / picker ----------

export function Welcome() {
  const { profiles, switchProfile } = useApp();
  const [creating, setCreating] = useState<string | null>(profiles.length ? null : 'Richard');
  if (creating !== null) {
    return (
      <main className="welcome">
        <header className="welcome-head">
          <h1 className="wordmark">Tally</h1>
          <p>{profiles.length ? 'Add a profile.' : 'Set up the first profile. You can add the second one right after.'}</p>
        </header>
        <ProfileForm
          suggestedName={creating}
          onDone={(p) => void switchProfile(p.id)}
          onCancel={profiles.length ? () => setCreating(null) : undefined}
        />
      </main>
    );
  }
  return <ProfilePicker onAdd={() => setCreating(profiles.some((p) => p.name === 'Amanda') ? '' : 'Amanda')} />;
}

export function ProfilePicker({ onAdd }: { onAdd: () => void }) {
  const { profiles, switchProfile } = useApp();
  return (
    <main className="welcome">
      <header className="welcome-head">
        <h1 className="wordmark">Tally</h1>
        <p>Who’s logging?</p>
      </header>
      <ul className="picker">
        {profiles.map((p) => (
          <li key={p.id}>
            <button className="picker-btn" onClick={() => void switchProfile(p.id)}>
              <span className="picker-initial" aria-hidden="true">
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              <span>{p.name}</span>
            </button>
          </li>
        ))}
      </ul>
      {profiles.length < 4 && (
        <button className="btn" onClick={onAdd}>
          Add a profile
        </button>
      )}
      <p className="hint picker-note">Profiles keep each person’s records apart in normal use. They aren’t password-protected: anyone with this device can open either one.</p>
    </main>
  );
}

// ---------- goals ----------

export function GoalsScreen() {
  const { data, reload, toast, go } = useApp();
  const p = data!.profile;
  const [t, setT] = useState<Targets>({ ...p.targets });
  const [targetWeight, setTargetWeight] = useState<number | null>(p.targetWeight);
  const [rate, setRate] = useState(p.weeklyRate);
  const [confirmRecalc, setConfirmRecalc] = useState(false);
  const warning = consistencyWarning(t);
  const set = (k: keyof Targets, v: number | null) => setT((s) => ({ ...s, [k]: v ?? 0 }));
  const calc = computeTargets({ sex: p.sex, age: p.age, heightIn: p.heightIn, weightLb: p.currentWeight, targetWeightLb: targetWeight ?? p.targetWeight, weeklyRate: rate, activity: p.activityLevel });

  async function save() {
    if (!(t.calories > 0) || !targetWeight) return;
    const now = nowIso();
    const profile: Profile = { ...p, targets: t, targetWeight, weeklyRate: rate, updatedAt: now };
    await db.putMany({
      profiles: [profile],
      goalHistory: [{ id: uid(), profileId: p.id, effectiveDate: toDateKey(), targets: t, targetWeight, weeklyRate: rate, reason: 'Edited manually', createdAt: now, updatedAt: now }],
    });
    await reload();
    toast('Targets saved');
    go('settings');
  }

  const history = [...data!.goals].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="stack">
      <Section title="Daily targets">
        <div className="grid2">
          <Field label="Calories" htmlFor="g-cal">
            <NumberInput id="g-cal" value={t.calories} onChange={(v) => set('calories', v)} suffix="kcal" />
          </Field>
          <Field label="Protein" htmlFor="g-p">
            <NumberInput id="g-p" value={t.protein} onChange={(v) => set('protein', v)} suffix="g" />
          </Field>
          <Field label="Carbohydrates (total)" htmlFor="g-c">
            <NumberInput id="g-c" value={t.carbs} onChange={(v) => set('carbs', v)} suffix="g" />
          </Field>
          <Field label="Fat" htmlFor="g-f">
            <NumberInput id="g-f" value={t.fat} onChange={(v) => set('fat', v)} suffix="g" />
          </Field>
          <Field label="Fiber" htmlFor="g-fib" hint="Counted inside total carbs.">
            <NumberInput id="g-fib" value={t.fiber} onChange={(v) => set('fiber', v)} suffix="g" />
          </Field>
        </div>
        {warning && (
          <p className="warn" role="status">
            {warning}{' '}
            <button type="button" className="link" onClick={() => setT(macrosFor(t.calories, targetWeight ?? p.targetWeight, t.protein))}>
              Rebalance carbs and fat to {Math.round(t.calories).toLocaleString()} kcal
            </button>
          </p>
        )}
      </Section>
      <Section title="Weight goal">
        <div className="grid2">
          <Field label="Target weight" htmlFor="g-tw">
            <NumberInput id="g-tw" value={targetWeight} onChange={setTargetWeight} suffix="lb" />
          </Field>
          <Field label="Weekly loss rate" htmlFor="g-rate">
            <select id="g-rate" value={rate} onChange={(e) => setRate(Number(e.target.value))}>
              {WEEKLY_RATES.map((r) => (
                <option key={r} value={r}>
                  {r === 0 ? 'Maintain' : `${r} lb/week`}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <button type="button" className="btn" onClick={() => setConfirmRecalc(true)}>
          Recalculate from profile
        </button>
        {calc.warnings.map((w) => (
          <p key={w} className="warn">
            {w}
          </p>
        ))}
      </Section>
      <div className="actions">
        <button className="btn" onClick={() => go('settings')}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => void save()} disabled={!(t.calories > 0) || !targetWeight}>
          Save targets
        </button>
      </div>
      <Section title="Target history">
        <ul className="plain-list">
          {history.map((g) => (
            <li key={g.id}>
              <strong>{formatDate(g.effectiveDate, { month: 'short', day: 'numeric', year: 'numeric' })}</strong>: {Math.round(g.targets.calories).toLocaleString()} kcal, {Math.round(g.targets.protein)} g protein, target {g.targetWeight} lb. <span className="muted">{g.reason}</span>
            </li>
          ))}
        </ul>
      </Section>
      {confirmRecalc && (
        <Confirm
          title="Replace targets?"
          message={<TargetSummary t={calc.targets} />}
          confirmLabel="Use these targets"
          onCancel={() => setConfirmRecalc(false)}
          onConfirm={() => {
            setT(calc.targets);
            setConfirmRecalc(false);
          }}
        />
      )}
    </div>
  );
}
