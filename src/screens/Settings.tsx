import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state';
import type { FoodDef, MealBoundaries, Nutrients, SavedMeal } from '../lib/types';
import { EXT_KEYS } from '../lib/types';
import * as db from '../lib/db';
import { buildExport, exerciseCsv, foodCsv, labCsv, planImport, STORE_LABELS, STORE_NAMES, validateExport, weightCsv } from '../lib/exportImport';
import type { ExportFile, ImportPlan } from '../lib/exportImport';
import { fmtKcal, fmtGrams, KEYS } from '../lib/nutrition';
import { nowIso, toDateKey } from '../lib/dates';
import { uid } from '../lib/id';
import { DATASET_VERSION, FOODS } from '../data/foods';
import { APP_VERSION } from '../version';
import { Confirm, Dialog, Empty, Field, Icon, NumberInput, Section } from '../components/ui';
import { ProfileForm } from './Profile';

// ---------- file helpers ----------

function downloadText(name: string, mime: string, text: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function canShareFiles(): boolean {
  try {
    return typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.json', { type: 'application/json' })] });
  } catch {
    return false;
  }
}

async function shareText(name: string, mime: string, text: string) {
  const file = new File([text], name, { type: mime });
  await navigator.share({ files: [file], title: name });
}

// ---------- main settings ----------

export function SettingsScreen() {
  const { data, profiles, switchProfile, go } = useApp();
  const p = data!.profile;
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  return (
    <div className="stack">
      <h1>Settings</h1>
      <Section title="Profile">
        <p>
          Logging as <strong>{p.name}</strong>.
        </p>
        <div className="row-wrap">
          {profiles
            .filter((x) => x.id !== p.id)
            .map((x) => (
              <button key={x.id} className="btn" onClick={() => void switchProfile(x.id)}>
                <Icon name="user" size={18} /> Switch to {x.name}
              </button>
            ))}
          <button className="btn" onClick={() => void switchProfile(null)}>
            {profiles.length > 1 ? 'Profile list' : 'Add a profile'}
          </button>
        </div>
      </Section>

      <nav className="settings-nav" aria-label="Settings sections">
        <button onClick={() => go('profile')}>
          <span>Personal details</span>
          <span className="muted small">
            Age {p.age}, {Math.floor(p.heightIn / 12)} ft {Math.round(p.heightIn % 12)} in, {Math.round(p.currentWeight * 10) / 10} lb
          </span>
        </button>
        <button onClick={() => go('goals')}>
          <span>Calorie and macro targets</span>
          <span className="muted small">
            {fmtKcal(p.targets.calories)} kcal, {p.targets.protein} g protein, target {p.targetWeight} lb
          </span>
        </button>
        <button onClick={() => go('saved')}>
          <span>Saved foods and meals</span>
          <span className="muted small">
            {data!.meals.length} meals, {data!.customFoods.length} custom foods
          </span>
        </button>
        <button onClick={() => go('data')}>
          <span>Backup, transfer, and reset</span>
          <span className="muted small">Export and import JSON or CSV</span>
        </button>
      </nav>

      <MealTimes />

      <Section title="Privacy">
        <div className="prose">
          <p>Everything you log is stored in this browser’s IndexedDB on this device. Tally has no server, no accounts, no analytics, and no ads. GitHub hosts the app’s files only; it never receives your records.</p>
          <p>The chat runs entirely on this device: the food matching, totals, recommendations, and weekly summaries are all calculated here, with no AI service involved. Chat history is stored per profile, on this device only.</p>
          <p>The only time anything leaves the device is when you choose to: copying a prompt to ChatGPT, sharing a photo with it, or exporting a backup file. A food prompt contains just the food description. A meal-idea prompt contains only today’s remaining calories, protein, saturated fat, and fiber. Neither includes your weight, history, or blood tests.</p>
          <p>Records are per device. Your phone and your computer each keep their own copy; use Backup and transfer to move them. Clearing site data, deleting the installed app, or private browsing can erase records, so export a backup regularly.</p>
          <p>Profiles separate two people’s logs for everyday use. They aren’t a security boundary: anyone using this device can open either profile.</p>
        </div>
      </Section>

      <Section title="About">
        <dl className="about">
          <div>
            <dt>App version</dt>
            <dd>{APP_VERSION}</dd>
          </div>
          <div>
            <dt>Food list</dt>
            <dd>
              {FOODS.length} foods, dataset {DATASET_VERSION}. Values compiled from USDA FoodData Central (public domain); generic label values are marked as such.
            </dd>
          </div>
          <div>
            <dt>Storage</dt>
            <dd>{persisted === true ? 'Persistent (the browser won’t clear it to free space)' : persisted === false ? 'Best effort (the browser may clear it under storage pressure; install the app and keep backups)' : 'Unknown'}</dd>
          </div>
        </dl>
      </Section>
    </div>
  );
}

function MealTimes() {
  const { data, reload, toast } = useApp();
  const p = data!.profile;
  const [b, setB] = useState<MealBoundaries>(p.mealBoundaries);
  const toTime = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  const fromTime = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    return h + m / 60;
  };
  const valid = b.breakfastStart < b.breakfastEnd && b.breakfastEnd <= b.lunchEnd && b.lunchEnd <= b.dinnerStart && b.dinnerStart < b.dinnerEnd;
  const changed = JSON.stringify(b) !== JSON.stringify(p.mealBoundaries);
  const field = (k: keyof MealBoundaries, label: string) => (
    <Field label={label} htmlFor={`mb-${k}`}>
      <input id={`mb-${k}`} type="time" value={toTime(b[k])} onChange={(e) => e.target.value && setB({ ...b, [k]: fromTime(e.target.value) })} />
    </Field>
  );
  return (
    <Section title="Meal times">
      <p className="hint">New entries default to a meal by time of day. You can always change it when reviewing. Anything outside these windows defaults to snack.</p>
      <div className="grid2">
        {field('breakfastStart', 'Breakfast from')}
        {field('breakfastEnd', 'Lunch from')}
        {field('lunchEnd', 'Lunch until')}
        {field('dinnerStart', 'Dinner from')}
        {field('dinnerEnd', 'Dinner until')}
      </div>
      {!valid && <p className="warn">Times must run in order through the day.</p>}
      {changed && (
        <button
          className="btn btn-primary"
          disabled={!valid}
          onClick={async () => {
            await db.put('profiles', { ...p, mealBoundaries: b, updatedAt: nowIso() });
            await reload();
            toast('Meal times saved');
          }}
        >
          Save meal times
        </button>
      )}
    </Section>
  );
}

export function ProfileEditScreen() {
  const { data, reload, go, toast } = useApp();
  return (
    <div className="stack">
      <h1>Personal details</h1>
      <ProfileForm
        existing={data!.profile}
        onCancel={() => go('settings')}
        onDone={async () => {
          await reload();
          toast('Profile saved');
          go('settings');
        }}
      />
    </div>
  );
}

// ---------- data: export / import / reset ----------

export function DataScreen() {
  const { data, profiles, reload, toast, switchProfile } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ file: ExportFile; merge: ImportPlan; replace: ImportPlan; name: string } | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState<'profile' | 'all' | null>(null);
  const [resetText, setResetText] = useState('');
  const share = canShareFiles();
  const stamp = toDateKey();
  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.name ?? id;

  async function exportJson(how: 'download' | 'share') {
    const all = await db.exportAll();
    const text = JSON.stringify(buildExport(all, APP_VERSION), null, 2);
    const name = `tally-backup-${stamp}.json`;
    try {
      if (how === 'share') await shareText(name, 'application/json', text);
      else downloadText(name, 'application/json', text);
      await db.setSetting('lastExport', nowIso());
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast('Export didn’t finish. Try Download instead.');
    }
  }

  async function exportCsv(kind: 'food' | 'weight' | 'exercise' | 'labs') {
    const all = await db.exportAll();
    const csv = kind === 'food' ? foodCsv(all.foodEntries, nameOf) : kind === 'weight' ? weightCsv(all.weightEntries, nameOf) : kind === 'labs' ? labCsv(all.labResults, nameOf) : exerciseCsv(all.exerciseEntries, nameOf);
    downloadText(`tally-${kind}-${stamp}.csv`, 'text/csv', csv);
  }

  async function pickFile(f: File) {
    setErrors([]);
    let json: unknown;
    try {
      json = JSON.parse(await f.text());
    } catch {
      setErrors(['That file isn’t valid JSON.']);
      return;
    }
    const v = validateExport(json);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    const local = await db.exportAll();
    setMode('merge');
    setPending({ file: v.file, merge: planImport(v.file, local, 'merge'), replace: planImport(v.file, local, 'replace'), name: f.name });
  }

  async function runImport() {
    if (!pending) return;
    setBusy(true);
    const plan = mode === 'merge' ? pending.merge : pending.replace;
    try {
      await db.applyImport(plan.writes, mode === 'replace');
      const remaining = await db.getAll<{ id: string }>('profiles');
      const active = data?.profile.id;
      setPending(null);
      if (!active || !remaining.some((p) => p.id === active)) await switchProfile(remaining[0]?.id ?? null);
      else await reload();
      toast('Import complete');
    } catch (e) {
      setErrors([`Import failed and nothing was changed: ${e instanceof Error ? e.message : e}`]);
    } finally {
      setBusy(false);
    }
  }

  async function runReset() {
    if (reset === 'profile' && data) {
      await db.deleteProfile(data.profile.id);
      setReset(null);
      await switchProfile(null);
      toast('Profile deleted');
    } else if (reset === 'all') {
      await db.wipeAll();
      setReset(null);
      await switchProfile(null);
      toast('All local data deleted');
    }
  }

  const plan = pending ? (mode === 'merge' ? pending.merge : pending.replace) : null;

  return (
    <div className="stack">
      <h1>Backup and transfer</h1>
      <Section title="Export">
        <p className="hint">A JSON backup holds every profile and record on this device. Import it on another device to copy your data there, or keep it as a backup. Save one somewhere outside the browser, like iCloud Drive or OneDrive, every week or two.</p>
        <div className="row-wrap">
          <button className="btn btn-primary" onClick={() => void exportJson('download')}>
            Download backup (JSON)
          </button>
          {share && (
            <button className="btn" onClick={() => void exportJson('share')}>
              Share backup file
            </button>
          )}
        </div>
        <p className="hint">Spreadsheet exports (CSV), all profiles:</p>
        <div className="row-wrap">
          <button className="btn" onClick={() => void exportCsv('food')}>
            Food log
          </button>
          <button className="btn" onClick={() => void exportCsv('weight')}>
            Weigh-ins
          </button>
          <button className="btn" onClick={() => void exportCsv('exercise')}>
            Workouts
          </button>
          <button className="btn" onClick={() => void exportCsv('labs')}>
            Blood tests
          </button>
        </div>
      </Section>

      <Section title="Import">
        <p className="hint">Choose a Tally JSON backup. You’ll see what it contains and choose how to apply it before anything changes.</p>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Choose backup file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          tabIndex={-1}
          aria-label="Backup file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void pickFile(f);
          }}
        />
        {errors.length > 0 && (
          <div className="warn" role="alert">
            <p>
              <strong>This file can’t be imported.</strong>
            </p>
            <ul>
              {errors.map((er) => (
                <li key={er}>{er}</li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title="Reset">
        <div className="row-wrap">
          {data && (
            <button className="btn btn-danger-quiet" onClick={() => setReset('profile')}>
              Delete {data.profile.name}’s profile and records
            </button>
          )}
          <button className="btn btn-danger-quiet" onClick={() => setReset('all')}>
            Delete all data on this device
          </button>
        </div>
      </Section>

      {pending && plan && (
        <Dialog
          title={`Import ${pending.name}`}
          onClose={() => setPending(null)}
          actions={
            <>
              <button className="btn" onClick={() => setPending(null)}>
                Cancel
              </button>
              <button className={`btn ${mode === 'replace' ? 'btn-danger' : 'btn-primary'}`} disabled={busy} onClick={() => void runImport()}>
                {mode === 'merge' ? 'Merge into this device' : 'Replace everything'}
              </button>
            </>
          }
        >
          <p className="muted small">
            Exported {new Date(pending.file.exportedAt).toLocaleString()} from app version {pending.file.appVersion}. Profiles in file: {pending.file.data.profiles.map((p) => p.name).join(', ') || 'none'}.
          </p>
          <fieldset className="radio-stack">
            <legend>How to apply it</legend>
            <label className="radio">
              <input type="radio" name="mode" checked={mode === 'merge'} onChange={() => setMode('merge')} /> <span><strong>Merge.</strong> Add new records, update ones that are newer in the file, skip duplicates. Nothing here is deleted.</span>
            </label>
            <label className="radio">
              <input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} /> <span><strong>Replace.</strong> Delete everything on this device and use the file instead.</span>
            </label>
          </fieldset>
          {Object.keys(pending.merge.profileMap).length > 0 && mode === 'merge' && (
            <p className="hint">
              {Object.keys(pending.merge.profileMap)
                .map((id) => pending.file.data.profiles.find((p) => p.id === id)?.name)
                .join(', ')}{' '}
              already exists here, so those records will be merged into the existing profile.
            </p>
          )}
          <div className="table-scroll">
            <table className="mini-table">
              <thead>
                <tr>
                  <th scope="col">Records</th>
                  <th scope="col">In file</th>
                  <th scope="col">{mode === 'merge' ? 'New' : 'Written'}</th>
                  {mode === 'merge' && <th scope="col">Updated</th>}
                  {mode === 'merge' && <th scope="col">Skipped</th>}
                </tr>
              </thead>
              <tbody>
                {STORE_NAMES.filter((s) => plan.stores[s].incoming > 0).map((s) => (
                  <tr key={s}>
                    <th scope="row">{STORE_LABELS[s]}</th>
                    <td>{plan.stores[s].incoming}</td>
                    <td>{plan.stores[s].added}</td>
                    {mode === 'merge' && <td>{plan.stores[s].updated}</td>}
                    {mode === 'merge' && <td>{plan.stores[s].unchanged + plan.stores[s].duplicates}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {mode === 'replace' && <p className="warn">Replace deletes the records currently on this device. Download a backup first if you might need them.</p>}
          <p className="hint">The import runs as one transaction: if anything fails, nothing changes.</p>
        </Dialog>
      )}

      {reset && (
        <Dialog
          title={reset === 'all' ? 'Delete all data on this device?' : `Delete ${data?.profile.name}’s profile?`}
          onClose={() => setReset(null)}
          actions={
            <>
              <button className="btn" onClick={() => setReset(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" disabled={resetText.trim().toLowerCase() !== 'delete'} onClick={() => void runReset()}>
                Delete
              </button>
            </>
          }
        >
          <p>{reset === 'all' ? 'Every profile, food log, workout, weigh-in, and setting on this device will be erased.' : 'This profile and all of its records will be erased. Other profiles are kept.'} This can’t be undone. Other devices aren’t affected.</p>
          <Field label="Type delete to confirm" htmlFor="reset-text">
            <input id="reset-text" value={resetText} onChange={(e) => setResetText(e.target.value)} autoComplete="off" />
          </Field>
        </Dialog>
      )}
    </div>
  );
}

// ---------- saved foods and meals ----------

export function SavedScreen() {
  const { data, reload, toast, go, setFoodIntent } = useApp();
  const d = data!;
  const [toDelete, setToDelete] = useState<{ kind: 'meal' | 'food'; id: string; name: string } | null>(null);
  const [rename, setRename] = useState<SavedMeal | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const meals = [...d.meals].sort((a, b) => a.name.localeCompare(b.name));
  const foods = [...d.customFoods].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="stack">
      <h1>Saved foods and meals</h1>
      <Section title="Meals">
        {meals.length ? (
          <ul className="row-list">
            {meals.map((m) => (
              <li key={m.id}>
                <button
                  className="row-main"
                  onClick={() => {
                    setFoodIntent({ mealId: m.id });
                    go('food');
                  }}
                >
                  <span>
                    <strong>{m.name}</strong>
                  </span>
                  <span className="muted small">
                    {m.items.map((i) => i.name).join(', ')}. {fmtKcal(m.totals.calories)} kcal, {fmtGrams(m.totals.protein)} g protein
                  </span>
                </button>
                <button
                  className="icon-btn"
                  onClick={() => {
                    setRename(m);
                    setNewName(m.name);
                  }}
                  aria-label={`Rename ${m.name}`}
                >
                  <Icon name="settings" size={18} />
                </button>
                <button className="icon-btn" onClick={() => setToDelete({ kind: 'meal', id: m.id, name: m.name })} aria-label={`Delete ${m.name}`}>
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No saved meals">When you review an entry, tick “Also save as a meal” to reuse it with one tap.</Empty>
        )}
      </Section>

      <Section title="My foods" action={<button className="link" onClick={() => setCreating(true)}>Add a food</button>}>
        {foods.length ? (
          <ul className="row-list">
            {foods.map((f) => (
              <li key={f.id}>
                <span className="row-main static">
                  <span>
                    <strong>{f.name}</strong>
                  </span>
                  <span className="muted small">
                    Per 1 {f.defaultUnit}: {fmtKcal(f.per.calories)} kcal, P {fmtGrams(f.per.protein)} C {fmtGrams(f.per.carbs)} F {fmtGrams(f.per.fat)} Fiber {fmtGrams(f.per.fiber)}. {f.source}.
                  </span>
                </span>
                <button className="icon-btn" onClick={() => setToDelete({ kind: 'food', id: f.id, name: f.name })} aria-label={`Delete ${f.name}`}>
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No custom foods">Add your protein powder, a favorite bar, or anything with a label so it’s matched exactly.</Empty>
        )}
      </Section>

      {creating && (
        <CustomFoodDialog
          onClose={() => setCreating(false)}
          onSave={async (f) => {
            await db.put('customFoods', f);
            setCreating(false);
            await reload();
            toast(`Added ${f.name}`);
          }}
        />
      )}
      {rename && (
        <Dialog
          title="Rename meal"
          onClose={() => setRename(null)}
          actions={
            <>
              <button className="btn" onClick={() => setRename(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={!newName.trim()}
                onClick={async () => {
                  await db.put('savedMeals', { ...rename, name: newName.trim(), updatedAt: nowIso() });
                  setRename(null);
                  await reload();
                }}
              >
                Save name
              </button>
            </>
          }
        >
          <Field label="Name" htmlFor="rn">
            <input id="rn" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </Field>
        </Dialog>
      )}
      {toDelete && (
        <Confirm
          title={`Delete ${toDelete.name}?`}
          message={toDelete.kind === 'meal' ? 'Past entries made from this meal stay in your log.' : 'Past entries that used this food stay in your log with their saved values.'}
          confirmLabel="Delete"
          danger
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            await db.remove(toDelete.kind === 'meal' ? 'savedMeals' : 'customFoods', toDelete.id);
            setToDelete(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function CustomFoodDialog({ onClose, onSave }: { onClose: () => void; onSave: (f: FoodDef) => void }) {
  const { data } = useApp();
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('serving');
  const [grams, setGrams] = useState<number | null>(null);
  const [n, setN] = useState<Record<keyof Nutrients, number | null>>({ calories: null, protein: null, carbs: null, fat: null, fiber: 0, satFat: null, solubleFiber: null, cholesterol: null, sodium: null });
  const valid = name.trim() && unit.trim() && KEYS.every((k) => n[k] !== null && n[k]! >= 0) && (n.fiber ?? 0) <= (n.carbs ?? 0) && (n.satFat ?? 0) <= (n.fat ?? 0);
  return (
    <Dialog
      title="Add a food"
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!valid}
            onClick={() => {
              const now = nowIso();
              const u = unit.trim().toLowerCase();
              const portions: Record<string, number> = { [u]: 1 };
              if (grams && grams > 0) portions.g = 1 / grams;
              onSave({
                id: uid(),
                name: name.trim(),
                category: 'My foods',
                synonyms: [name.trim().toLowerCase()],
                basisAmount: 1,
                basisUnit: 'serving',
                per: { calories: n.calories!, protein: n.protein!, carbs: n.carbs!, fat: n.fat!, fiber: n.fiber!, ...Object.fromEntries(EXT_KEYS.filter((k) => n[k] !== null).map((k) => [k, n[k]])) },
                portions,
                defaultUnit: u,
                source: 'Entered by you',
                profileId: data!.profile.id,
                createdAt: now,
                updatedAt: now,
              });
            }}
          >
            Save food
          </button>
        </>
      }
    >
      <Field label="Name" htmlFor="cf-name" hint="Use the words you’d type when logging it.">
        <input id="cf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Gold Standard whey" />
      </Field>
      <div className="grid2">
        <Field label="Unit" htmlFor="cf-unit" hint="scoop, bar, serving, cup…">
          <input id="cf-unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </Field>
        <Field label="Grams per unit (optional)" htmlFor="cf-g" hint="Lets you log it in g or oz.">
          <NumberInput id="cf-g" value={grams} onChange={setGrams} />
        </Field>
      </div>
      <p className="hint">Nutrition for one {unit || 'unit'}, from the label:</p>
      <div className="nutrient-grid">
        {KEYS.map((k) => (
          <label key={k}>
            <span>
              {k[0].toUpperCase() + k.slice(1)}
              {k === 'calories' ? '' : ' (g)'}
            </span>
            <NumberInput label={k} value={n[k]} onChange={(v) => setN({ ...n, [k]: v })} />
          </label>
        ))}
      </div>
      <p className="hint">Optional, from the label. Leave blank if it isn’t listed; blank means unknown, not zero.</p>
      <div className="nutrient-grid ext">
        {EXT_KEYS.map((k) => (
          <label key={k}>
            <span>{{ satFat: 'Sat fat g', solubleFiber: 'Soluble fiber g', cholesterol: 'Cholesterol mg', sodium: 'Sodium mg' }[k]}</span>
            <NumberInput label={k} placeholder="?" value={n[k]} onChange={(v) => setN({ ...n, [k]: v })} />
          </label>
        ))}
      </div>
      {(n.fiber ?? 0) > (n.carbs ?? 0) && <p className="warn small">Fiber is part of total carbs, so it can’t be larger.</p>}
      {(n.satFat ?? 0) > (n.fat ?? 0) && <p className="warn small">Saturated fat is part of total fat, so it can’t be larger.</p>}
      {n.calories !== null && n.protein !== null && n.carbs !== null && n.fat !== null && Math.abs(n.protein * 4 + n.carbs * 4 + n.fat * 9 - n.calories) > Math.max(20, n.calories * 0.2) && (
        <p className="hint">The macros don’t quite add up to the calories ({Math.round(n.protein * 4 + n.carbs * 4 + n.fat * 9)} kcal from macros). That’s fine if it matches the label.</p>
      )}
    </Dialog>
  );
}
