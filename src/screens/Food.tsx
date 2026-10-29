import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useApp } from '../state';
import type { FoodDef, FoodEntry, LoggedItem, MealCategory, Nutrients, SavedMeal } from '../lib/types';
import { MEALS, MEAL_LABEL } from '../lib/types';
import { parseFoodText, matchFood, makeItem, defaultMealFor } from '../lib/parser';
import { entrySource, fmtGrams, fmtKcal, itemsTotals, recalcItem, roundStored, scaleNutrients, unitsForFood, KEYS } from '../lib/nutrition';
import { buildFoodPrompt, parseChatGptResponse, importedToLogged, CHATGPT_URL } from '../lib/chatgpt';
import type { ImportResult } from '../lib/chatgpt';
import { addDays, formatDate, isValidDateKey, isValidTimeKey, nowIso, toDateKey, toTimeKey } from '../lib/dates';
import { formatQuantity, unitLabel } from '../lib/units';
import { hashText, uid } from '../lib/id';
import * as db from '../lib/db';
import { Confirm, Empty, Field, Icon, NumberInput, Section, Segmented, SourceBadge } from '../components/ui';

// ---------- review model ----------

interface Line {
  key: string;
  item: LoggedItem | null;
  raw?: string;
  candidates: FoodDef[];
  notes: string[];
  needsUnit?: boolean;
  problems?: string[];
  overrideWarn?: boolean;
}

interface Draft {
  date: string;
  time: string;
  meal: MealCategory;
  text: string;
  lines: Line[];
  notes: string;
  editingId?: string;
  createdAt?: string;
  importHash?: string;
  fromMeal?: { meal: SavedMeal; servings: number };
  flags: { restaurant: boolean; dish: boolean };
}

type Phase = 'compose' | 'review' | 'chatgpt';

const NUTRIENT_LABEL: Record<keyof Nutrients, string> = { calories: 'kcal', protein: 'Protein', carbs: 'Carbs', fat: 'Fat', fiber: 'Fiber' };

function lineFromItem(item: LoggedItem, notes: string[] = []): Line {
  return { key: uid(), item, candidates: [], notes };
}

function blocking(l: Line): string | null {
  if (!l.item) return `Choose a match or enter values for “${l.raw}”.`;
  if (l.needsUnit) return `Pick a unit for ${l.item.name}.`;
  if (l.problems?.length) return `Check the values for ${l.item.name}.`;
  if (!l.item.name.trim()) return 'Every item needs a name.';
  if (!(l.item.quantity > 0)) return `Enter a quantity above zero for ${l.item.name}.`;
  if (!KEYS.every((k) => Number.isFinite(l.item!.nutrients[k]) && l.item!.nutrients[k] >= 0)) return `Nutrition values for ${l.item.name} must be zero or more.`;
  if (l.item.nutrients.fiber > l.item.nutrients.carbs + 0.05) return `Fiber can’t exceed total carbs for ${l.item.name}.`;
  return null;
}

async function copyText(text: string, fallbackEl?: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (fallbackEl) {
      fallbackEl.focus();
      fallbackEl.select();
      try {
        return document.execCommand('copy');
      } catch {
        return false;
      }
    }
    return false;
  }
}

export function FoodScreen() {
  const app = useApp();
  const { data, foodIntent, setFoodIntent, selectedDate, index, allFoods, foodById, online, toast, reload, go, setSelectedDate } = app;
  const d = data!;
  const [phase, setPhase] = useState<Phase>('compose');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [chatScope, setChatScope] = useState<'all' | 'unmatched'>('all');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dupOk, setDupOk] = useState(false);

  const freshDraft = (date = foodIntent.date ?? selectedDate): Draft => {
    const now = new Date();
    return { date, time: toTimeKey(now), meal: defaultMealFor(now, d.profile.mealBoundaries), text: foodIntent.text ?? '', lines: [], notes: '', flags: { restaurant: false, dish: false } };
  };
  const [draft, setDraft] = useState<Draft>(freshDraft);

  // load an entry for editing, or a saved meal
  useEffect(() => {
    if (foodIntent.editEntryId) {
      const e = d.food.find((x) => x.id === foodIntent.editEntryId);
      if (e) {
        setDraft({ date: e.date, time: e.time, meal: e.meal, text: '', lines: e.items.map((i) => lineFromItem({ ...i })), notes: e.notes ?? '', editingId: e.id, createdAt: e.createdAt, importHash: e.importHash, flags: { restaurant: false, dish: false } });
        setPhase('review');
      }
    } else if (foodIntent.mealId) {
      const m = d.meals.find((x) => x.id === foodIntent.mealId);
      if (m) applyMeal(m);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!photo) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const update = (patch: Partial<Draft>) => setDraft((s) => ({ ...s, ...patch }));
  const setLines = (fn: (ls: Line[]) => Line[]) => setDraft((s) => ({ ...s, lines: fn(s.lines) }));

  function estimateLocally() {
    const r = parseFoodText(draft.text, index);
    const lines: Line[] = r.lines.map((l) => ({ key: l.id, item: l.item ?? null, raw: l.raw, candidates: l.candidates, notes: l.notes, needsUnit: l.needsUnit }));
    setDraft((s) => ({ ...s, lines: [...s.lines, ...lines], flags: { restaurant: r.restaurant, dish: r.dish } }));
    setPhase('review');
  }

  function addFood(food: FoodDef, qty = 1, unit = food.defaultUnit) {
    const it = makeItem(food, qty, unit);
    if (!it) return;
    setLines((ls) => [...ls, lineFromItem(it)]);
    setPhase('review');
  }

  function addItemCopy(i: LoggedItem) {
    setLines((ls) => [...ls, lineFromItem({ ...i, id: uid(), manualOverride: i.manualOverride })]);
    setPhase('review');
  }

  function applyMeal(m: SavedMeal) {
    setDraft((s) => ({ ...s, lines: m.items.map((i) => lineFromItem({ ...i, id: uid() })), fromMeal: { meal: m, servings: 1 } }));
    setPhase('review');
  }

  function scaleMeal(servings: number) {
    if (!draft.fromMeal || !(servings > 0)) return;
    const m = draft.fromMeal.meal;
    setDraft((s) => ({
      ...s,
      fromMeal: { meal: m, servings },
      lines: m.items.map((i) => lineFromItem({ ...i, id: uid(), quantity: i.quantity * servings, nutrients: scaleNutrients(i.nutrients, servings) })),
    }));
  }

  const blockers = draft.lines.map(blocking).filter(Boolean) as string[];
  const unmatched = draft.lines.filter((l) => !l.item);
  const totals = itemsTotals(draft.lines.filter((l) => l.item).map((l) => l.item!));
  const dupEntry = draft.importHash && !draft.editingId ? d.food.find((e) => e.importHash === draft.importHash) : undefined;

  async function save(saveMealName: string | null) {
    const items = draft.lines.map((l) => ({ ...l.item!, nutrients: roundStored(l.item!.nutrients) }));
    if (!items.length || blockers.length) return;
    if (!isValidDateKey(draft.date) || !isValidTimeKey(draft.time)) {
      toast('Enter a valid date and time.');
      return;
    }
    const now = nowIso();
    const entry: FoodEntry = {
      id: draft.editingId ?? uid(),
      profileId: d.profile.id,
      date: draft.date,
      time: draft.time,
      meal: draft.meal,
      items,
      totals: itemsTotals(items),
      sourceType: entrySource(items),
      estimated: items.some((i) => i.estimated),
      notes: draft.notes.trim() || undefined,
      importHash: draft.importHash,
      createdAt: draft.createdAt ?? now,
      updatedAt: now,
    };
    const writes: Record<string, unknown[]> = { foodEntries: [entry] };
    if (saveMealName) {
      writes.savedMeals = [{ id: uid(), profileId: d.profile.id, name: saveMealName, items: items.map((i) => ({ ...i, id: uid() })), totals: itemsTotals(items), createdAt: now, updatedAt: now, lastUsed: now } satisfies SavedMeal];
    } else if (draft.fromMeal) {
      writes.savedMeals = [{ ...draft.fromMeal.meal, lastUsed: now }];
    }
    try {
      await db.putMany(writes as never);
      void db.requestPersistence();
      await reload();
      toast(draft.editingId ? 'Entry updated' : `Saved to ${MEAL_LABEL[draft.meal].toLowerCase()}`);
      setPhoto(null);
      setFoodIntent({});
      setSelectedDate(draft.date);
      go('dashboard');
    } catch (e) {
      toast(`Couldn’t save: ${e instanceof Error ? e.message : e}`);
    }
  }

  async function deleteEntry() {
    if (!draft.editingId) return;
    await db.remove('foodEntries', draft.editingId);
    await reload();
    toast('Entry deleted');
    setFoodIntent({});
    go('dashboard');
  }

  function cancel() {
    setPhoto(null);
    setFoodIntent({});
    if (draft.editingId) go('dashboard');
    else {
      setDraft(freshDraft(draft.date));
      setPhase('compose');
    }
  }

  // ---------- views ----------

  if (phase === 'chatgpt') {
    const desc = chatScope === 'unmatched' ? unmatched.map((l) => l.raw).join('\n') : draft.text;
    return (
      <ChatGptHandoff
        description={desc}
        photo={photo}
        photoUrl={photoUrl}
        online={online}
        onRemovePhoto={() => setPhoto(null)}
        onBack={() => setPhase(draft.lines.length ? 'review' : 'compose')}
        onManual={() => {
          const blank: Line = { ...lineFromItem({ id: uid(), name: desc.split('\n')[0].slice(0, 80) || 'Food', quantity: 1, unit: 'serving', nutrients: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }, source: 'user', estimated: true }), problems: ['Enter the nutrition values.'] };
          setLines((ls) => [...ls.filter((l) => l.item), blank]);
          setPhase('review');
        }}
        onImport={(res, hash) => {
          const imported = res.items.map((it) => ({ key: uid(), item: importedToLogged(it), candidates: [], notes: it.uncertain ? ['ChatGPT marked this as uncertain.'] : [], problems: it.problems.length ? it.problems : undefined }));
          // "all" replaces any rough local estimate so nothing is counted twice
          setDraft((s) => ({ ...s, importHash: hash, flags: { restaurant: false, dish: false }, lines: [...(chatScope === 'unmatched' ? s.lines.filter((l) => l.item) : []), ...imported] }));
          setDupOk(false);
          setPhoto(null);
          setPhase('review');
        }}
      />
    );
  }

  if (phase === 'compose') {
    return (
      <Composer
        draft={draft}
        update={update}
        onEstimate={estimateLocally}
        onChatGpt={() => {
          setChatScope('all');
          setPhase('chatgpt');
        }}
        onPhoto={(f) => {
          setPhoto(f);
          setChatScope('all');
          setPhase('chatgpt');
        }}
        allFoods={allFoods}
        onAddFood={addFood}
        onAddItem={addItemCopy}
        onUseMeal={applyMeal}
      />
    );
  }

  return (
    <div className="stack">
      <h1>{draft.editingId ? 'Edit entry' : 'Review before saving'}</h1>
      <div className="grid2">
        <Field label="Date" htmlFor="rv-date">
          <input id="rv-date" type="date" value={draft.date} max={toDateKey()} onChange={(e) => update({ date: e.target.value })} />
        </Field>
        <Field label="Time" htmlFor="rv-time">
          <input id="rv-time" type="time" value={draft.time} onChange={(e) => update({ time: e.target.value })} />
        </Field>
      </div>
      <Field label="Meal">
        <Segmented label="Meal" value={draft.meal} onChange={(m) => update({ meal: m })} options={MEALS.map((m) => ({ value: m, label: m === 'snack' ? 'Snack' : MEAL_LABEL[m] }))} />
      </Field>

      {(draft.flags.restaurant || draft.flags.dish) && (
        <div className="callout">
          <p>
            {draft.flags.restaurant ? 'This looks like a restaurant meal. Portions and recipes vary, so the local estimate below is rough.' : 'Dishes like sandwiches and bowls often include parts you didn’t list, such as bread, oil, or sauce.'}
          </p>
          <button
            className="btn"
            onClick={() => {
              setChatScope('all');
              setPhase('chatgpt');
            }}
          >
            Get a ChatGPT estimate instead
          </button>
        </div>
      )}

      {draft.fromMeal && (
        <Field label={`Servings of “${draft.fromMeal.meal.name}”`} htmlFor="rv-serv" hint="Scales every item. You can still change items one by one.">
          <NumberInput id="rv-serv" value={draft.fromMeal.servings} onChange={(v) => v && scaleMeal(v)} />
        </Field>
      )}

      {draft.lines.length === 0 && <Empty title="No items yet">Add a food below, or go back and describe what you ate.</Empty>}

      <ul className="review-list">
        {draft.lines.map((l) => (
          <li key={l.key}>
            <ReviewLine
              line={l}
              food={foodById(l.item?.foodId)}
              allFoods={allFoods}
              onChange={(nl) => setLines((ls) => ls.map((x) => (x.key === l.key ? nl : x)))}
              onRemove={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
              index={index}
            />
          </li>
        ))}
      </ul>

      <div className="review-tools">
        <FoodSearch allFoods={allFoods} onPick={(f) => addFood(f)} label="Add another food" />
        <button className="btn" onClick={() => setLines((ls) => [...ls, { ...lineFromItem({ id: uid(), name: '', quantity: 1, unit: 'serving', nutrients: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }, source: 'user', estimated: false }), problems: ['Enter the nutrition values.'] }])}>
          Enter a food by hand
        </button>
        {unmatched.length > 0 && (
          <button
            className="btn"
            onClick={() => {
              setChatScope('unmatched');
              setPhase('chatgpt');
            }}
          >
            Ask ChatGPT about {unmatched.length === 1 ? 'the unmatched item' : `the ${unmatched.length} unmatched items`}
          </button>
        )}
      </div>

      <section className="totals-bar" aria-label="Entry totals">
        <span>
          <strong>{fmtKcal(totals.calories)}</strong> kcal
        </span>
        <span>P {fmtGrams(totals.protein)} g</span>
        <span>C {fmtGrams(totals.carbs)} g</span>
        <span>F {fmtGrams(totals.fat)} g</span>
        <span>Fiber {fmtGrams(totals.fiber)} g</span>
      </section>

      <Field label="Notes" htmlFor="rv-notes">
        <textarea id="rv-notes" rows={2} value={draft.notes} onChange={(e) => update({ notes: e.target.value })} />
      </Field>

      <SaveControls
        disabled={!draft.lines.length || blockers.length > 0 || (!!dupEntry && !dupOk)}
        blockers={blockers}
        dupWarning={
          dupEntry ? (
            <label className="check warn">
              <input type="checkbox" checked={dupOk} onChange={(e) => setDupOk(e.target.checked)} /> You already saved an entry from this exact ChatGPT answer ({formatDate(dupEntry.date)} {MEAL_LABEL[dupEntry.meal].toLowerCase()}). Save it again anyway.
            </label>
          ) : null
        }
        editing={!!draft.editingId}
        onCancel={cancel}
        onSave={(name) => void save(name)}
        onDelete={() => setConfirmDelete(true)}
      />

      {confirmDelete && <Confirm title="Delete this entry?" message="It will be removed from your log and totals." confirmLabel="Delete entry" danger onCancel={() => setConfirmDelete(false)} onConfirm={() => void deleteEntry()} />}
    </div>
  );
}

function SaveControls({ disabled, blockers, dupWarning, editing, onCancel, onSave, onDelete }: { disabled: boolean; blockers: string[]; dupWarning: ReactNode; editing: boolean; onCancel: () => void; onSave: (mealName: string | null) => void; onDelete: () => void }) {
  const [asMeal, setAsMeal] = useState(false);
  const [name, setName] = useState('');
  return (
    <div className="stack-tight">
      <label className="check">
        <input type="checkbox" checked={asMeal} onChange={(e) => setAsMeal(e.target.checked)} /> Also save as a meal I can reuse
      </label>
      {asMeal && (
        <Field label="Meal name" htmlFor="rv-mealname">
          <input id="rv-mealname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Usual breakfast" />
        </Field>
      )}
      {dupWarning}
      {blockers.length > 0 && (
        <ul className="blockers" aria-live="polite">
          {[...new Set(blockers)].map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      <div className="actions">
        {editing && (
          <button className="btn btn-danger-quiet" onClick={onDelete}>
            <Icon name="trash" size={18} /> Delete
          </button>
        )}
        <span className="spacer" />
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={disabled || (asMeal && !name.trim())} onClick={() => onSave(asMeal ? name.trim() : null)}>
          {editing ? 'Save changes' : 'Save entry'}
        </button>
      </div>
    </div>
  );
}

// ---------- review line ----------

function ReviewLine({ line, food, allFoods, onChange, onRemove, index }: { line: Line; food?: FoodDef; allFoods: FoodDef[]; onChange: (l: Line) => void; onRemove: () => void; index: ReturnType<typeof useApp>['index'] }) {
  const { toast, data, reload } = useApp();
  if (!line.item) {
    return (
      <div className="rline unmatched">
        <div className="rline-head">
          <p>
            <strong>“{line.raw}”</strong> isn’t in the food list.
          </p>
          <button className="icon-btn" onClick={onRemove} aria-label={`Remove ${line.raw}`}>
            <Icon name="close" size={18} />
          </button>
        </div>
        {line.notes.map((n) => (
          <p key={n} className="muted small">
            {n}
          </p>
        ))}
        {line.candidates.length > 0 && (
          <Field label="Closest matches" htmlFor={`cand-${line.key}`}>
            <select
              id={`cand-${line.key}`}
              defaultValue=""
              onChange={(e) => {
                const f = allFoods.find((x) => x.id === e.target.value);
                if (!f) return;
                const it = makeItem(f, 1, f.defaultUnit, { estimated: true });
                if (it) onChange({ ...line, item: it, notes: [`Chosen for “${line.raw}”. Check the amount.`] });
              }}
            >
              <option value="">Choose a match…</option>
              {line.candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="row-wrap">
          <FoodSearch
            allFoods={allFoods}
            label="Search the food list"
            initial={line.raw}
            onPick={(f) => {
              const it = makeItem(f, 1, f.defaultUnit, { estimated: true });
              if (it) onChange({ ...line, item: it, notes: [`Chosen for “${line.raw}”. Check the amount.`] });
            }}
          />
          <button className="btn" onClick={() => onChange({ ...line, item: { id: uid(), name: line.raw ?? '', quantity: 1, unit: 'serving', nutrients: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }, source: 'user', estimated: true }, problems: ['Enter the nutrition values.'] })}>
            Enter values myself
          </button>
        </div>
      </div>
    );
  }
  const it = line.item;
  const units = food ? unitsForFood(food) : null;

  function changeAmount(quantity: number, unit: string) {
    const next: LoggedItem = { ...it, quantity, unit };
    if (it.manualOverride) {
      onChange({ ...line, item: next, overrideWarn: !!(food || it.ref) });
      return;
    }
    const n = recalcItem(next, food);
    if (n) onChange({ ...line, item: { ...next, nutrients: n }, needsUnit: false, overrideWarn: false });
    else if (food) onChange({ ...line, item: next, needsUnit: true });
    else onChange({ ...line, item: next, overrideWarn: !!it.ref }); // AI item with a new unit: values stay as entered
  }

  function setNutrient(k: keyof Nutrients, v: number | null) {
    const nutrients = { ...it.nutrients, [k]: v ?? NaN };
    const source = it.source === 'database' || it.source === 'custom' ? it.source : it.source;
    onChange({ ...line, item: { ...it, nutrients, manualOverride: true, source }, problems: undefined, overrideWarn: false });
  }

  async function saveAsCustom() {
    if (!(it.quantity > 0)) return;
    const per = scaleNutrients(it.nutrients, 1 / it.quantity);
    const now = nowIso();
    const f: FoodDef = {
      id: uid(),
      name: it.name.trim(),
      category: 'My foods',
      synonyms: [it.name.trim().toLowerCase()],
      basisAmount: 1,
      basisUnit: 'serving',
      per: roundStored(per),
      portions: { [it.unit]: 1 },
      defaultUnit: it.unit,
      source: it.source === 'ai' ? 'ChatGPT estimate, reviewed' : 'Entered by you',
      profileId: data!.profile.id,
      createdAt: now,
      updatedAt: now,
    };
    await db.put('customFoods', f);
    await reload();
    onChange({ ...line, item: { ...it, foodId: f.id, source: 'custom' } });
    toast(`Saved “${f.name}” to your foods`);
  }

  const statusClass = line.needsUnit || line.problems?.length ? 'attention' : it.estimated || line.notes.length ? 'estimated' : 'ok';
  void index;

  return (
    <div className={`rline ${statusClass}`}>
      <div className="rline-head">
        <input className="rline-name" aria-label="Food name" value={it.name} onChange={(e) => onChange({ ...line, item: { ...it, name: e.target.value } })} />
        <button className="icon-btn" onClick={onRemove} aria-label={`Remove ${it.name || 'item'}`}>
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="rline-amount">
        <NumberInput label={`Quantity of ${it.name}`} value={it.quantity} onChange={(v) => v !== null && v > 0 && changeAmount(v, it.unit)} />
        {units ? (
          <select aria-label={`Unit for ${it.name}`} value={units.includes(it.unit) ? it.unit : ''} onChange={(e) => changeAmount(it.quantity, e.target.value)}>
            {!units.includes(it.unit) && <option value="">{it.unit} (pick one)</option>}
            {units.map((u) => (
              <option key={u} value={u}>
                {unitLabel(u, it.quantity)}
              </option>
            ))}
          </select>
        ) : (
          <input aria-label={`Unit for ${it.name}`} className="unit-text" value={it.unit} onChange={(e) => changeAmount(it.quantity, e.target.value)} />
        )}
        <SourceBadge source={it.source} estimated={it.estimated} />
      </div>
      {line.overrideWarn && (
        <div className="callout small">
          <p>You edited these nutrition values by hand, so the amount change didn’t update them.</p>
          <div className="row-wrap">
            <button
              className="btn btn-small"
              onClick={() => {
                const n = recalcItem(it, food);
                if (n) onChange({ ...line, item: { ...it, nutrients: n, manualOverride: false }, overrideWarn: false });
                else toast('Can’t recalculate: the unit changed from the original serving.');
              }}
            >
              Recalculate from {food ? 'the food list' : 'the original serving'}
            </button>
            <button className="btn btn-small" onClick={() => onChange({ ...line, overrideWarn: false })}>
              Keep my values
            </button>
          </div>
        </div>
      )}
      <div className="nutrient-grid">
        {KEYS.map((k) => (
          <label key={k} className={k === 'protein' ? 'protein' : ''}>
            <span>
              {NUTRIENT_LABEL[k]}
              {k === 'calories' ? '' : ' g'}
            </span>
            <NumberInput label={`${NUTRIENT_LABEL[k]} for ${it.name}${k === 'calories' ? '' : ' in grams'}`} value={Number.isFinite(it.nutrients[k]) ? (k === 'calories' ? Math.round(it.nutrients[k]) : Math.round(it.nutrients[k] * 10) / 10) : null} onChange={(v) => setNutrient(k, v)} />
          </label>
        ))}
      </div>
      {(line.notes.length > 0 || line.problems?.length || it.note) && (
        <ul className="rline-notes">
          {line.problems?.map((p) => (
            <li key={p} className="problem">
              {p}
            </li>
          ))}
          {line.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
          {it.note && <li>{it.note}</li>}
        </ul>
      )}
      {(it.source === 'ai' || it.source === 'user') && !line.problems?.length && it.name.trim() && (
        <button className="link small" onClick={() => void saveAsCustom()}>
          Save to my foods for next time
        </button>
      )}
      {food?.quality && !line.notes.includes(food.quality) && <p className="muted small">{food.quality}</p>}
    </div>
  );
}

// ---------- search ----------

export function searchFoods(q: string, allFoods: FoodDef[], index: ReturnType<typeof useApp>['index']): FoodDef[] {
  const s = q.trim().toLowerCase();
  if (s.length < 2) return [];
  const m = matchFood(s, index);
  const out: FoodDef[] = [];
  if (m.best) out.push(m.best.food);
  for (const c of m.candidates) if (!out.includes(c)) out.push(c);
  for (const f of allFoods) {
    if (out.length >= 12) break;
    if (!out.includes(f) && (f.name.toLowerCase().includes(s) || f.synonyms.some((x) => x.replace('~', '').includes(s)))) out.push(f);
  }
  return out.slice(0, 12);
}

function FoodSearch({ allFoods, onPick, label, initial = '' }: { allFoods: FoodDef[]; onPick: (f: FoodDef) => void; label: string; initial?: string }) {
  const { index } = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(initial);
  const results = useMemo(() => searchFoods(q, allFoods, index), [q, allFoods, index]);
  const id = useRef(uid()).current;
  if (!open)
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  return (
    <div className="search">
      <label htmlFor={`s-${id}`} className="visually-hidden">
        {label}
      </label>
      <input id={`s-${id}`} autoFocus type="search" placeholder="Search foods" value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim().length >= 2 && (
        <ul className="search-results" role="listbox" aria-label="Matching foods">
          {results.length === 0 && <li className="muted">No match in the food list.</li>}
          {results.map((f) => (
            <li key={f.id}>
              <button
                role="option"
                aria-selected="false"
                onClick={() => {
                  onPick(f);
                  setOpen(false);
                  setQ('');
                }}
              >
                <span>{f.name}</span>
                <span className="muted small">{f.profileId ? 'My food' : f.category}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className="link small" onClick={() => setOpen(false)}>
        Close search
      </button>
    </div>
  );
}

// ---------- composer ----------

function Composer({ draft, update, onEstimate, onChatGpt, onPhoto, allFoods, onAddFood, onAddItem, onUseMeal }: {
  draft: Draft;
  update: (p: Partial<Draft>) => void;
  onEstimate: () => void;
  onChatGpt: () => void;
  onPhoto: (f: File) => void;
  allFoods: FoodDef[];
  onAddFood: (f: FoodDef) => void;
  onAddItem: (i: LoggedItem) => void;
  onUseMeal: (m: SavedMeal) => void;
}) {
  const { data, online, setFoodIntent, go } = useApp();
  const d = data!;
  const fileRef = useRef<HTMLInputElement>(null);
  const yesterday = addDays(draft.date, -1);

  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: LoggedItem[] = [];
    for (const e of [...d.food].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
      for (const i of e.items) {
        const k = (i.foodId ?? '') + '|' + i.name.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(i);
        if (out.length >= 10) return out;
      }
    }
    return out;
  }, [d.food]);

  const meals = useMemo(() => [...d.meals].sort((a, b) => (b.lastUsed ?? b.updatedAt).localeCompare(a.lastUsed ?? a.updatedAt)).slice(0, 6), [d.meals]);
  const yMeals = MEALS.map((m) => ({ m, items: d.food.filter((e) => e.date === yesterday && e.meal === m).flatMap((e) => e.items) })).filter((x) => x.items.length);

  return (
    <div className="stack">
      <h1>Log food</h1>
      <p className="muted">
        For {formatDate(draft.date, { weekday: 'long', month: 'short', day: 'numeric' })}
        {draft.date !== toDateKey() && (
          <>
            {' '}
            <button className="link" onClick={() => update({ date: toDateKey() })}>
              Switch to today
            </button>
          </>
        )}
      </p>
      <Field label="What did you eat?" htmlFor="food-text" hint="Write it the way you’d say it. Separate foods with commas, “and”, or new lines.">
        <textarea
          id="food-text"
          rows={4}
          value={draft.text}
          placeholder={'2 scrambled eggs, 3 slices of bacon, and 2 pieces of toast with butter'}
          onChange={(e) => update({ text: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && draft.text.trim()) onEstimate();
          }}
        />
      </Field>
      <div className="compose-actions">
        <button className="btn btn-primary" disabled={!draft.text.trim()} onClick={onEstimate}>
          Estimate
        </button>
        <button className="btn" disabled={!draft.text.trim()} onClick={onChatGpt}>
          Ask ChatGPT
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <Icon name="camera" size={18} /> Photo
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="visually-hidden"
          aria-label="Choose a food photo"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onPhoto(f);
          }}
        />
      </div>
      <p className="hint">Estimate uses the food list on this device and works offline. ChatGPT is for restaurant meals, recipes, and anything the list doesn’t know{online ? '' : '; it needs a connection'}.</p>

      <FoodSearch allFoods={allFoods} onPick={onAddFood} label="Search the food list" />

      {yMeals.length > 0 && (
        <Section title="Repeat from yesterday">
          <div className="chips">
            {yMeals.map(({ m, items }) => (
              <button
                key={m}
                className="chip"
                onClick={() => {
                  update({ meal: m });
                  items.forEach((i) => onAddItem(i));
                }}
              >
                <Icon name="repeat" size={16} /> {MEAL_LABEL[m]}, {fmtKcal(itemsTotals(items).calories)} kcal
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Saved meals"
        action={
          <button
            className="link"
            onClick={() => {
              setFoodIntent({});
              go('saved');
            }}
          >
            Manage
          </button>
        }
      >
        {meals.length ? (
          <div className="chips">
            {meals.map((m) => (
              <button key={m.id} className="chip" onClick={() => onUseMeal(m)}>
                <Icon name="star" size={16} /> {m.name}, {fmtKcal(m.totals.calories)} kcal
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small">Tick “Also save as a meal” when you review an entry to reuse it here.</p>
        )}
      </Section>

      <Section title="Recent foods">
        {recent.length ? (
          <div className="chips">
            {recent.map((i) => (
              <button key={i.id} className="chip" onClick={() => onAddItem(i)}>
                {i.name}, {formatQuantity(i.quantity)} {unitLabel(i.unit, i.quantity)}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small">Foods you log show up here for one-tap reuse.</p>
        )}
      </Section>
    </div>
  );
}

// ---------- ChatGPT handoff ----------

function ChatGptHandoff({ description, photo, photoUrl, online, onRemovePhoto, onBack, onImport, onManual }: {
  description: string;
  photo: File | null;
  photoUrl: string | null;
  online: boolean;
  onRemovePhoto: () => void;
  onBack: () => void;
  onImport: (r: ImportResult, hash: string) => void;
  onManual: () => void;
}) {
  const { toast } = useApp();
  const [desc, setDesc] = useState(description);
  const [pasted, setPasted] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const prompt = buildFoodPrompt(desc, { photo: !!photo });
  const canSharePhoto = !!photo && typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [photo] });

  async function copy() {
    const ok = await copyText(prompt, promptRef.current);
    toast(ok ? 'Prompt copied' : 'Select the prompt text and copy it manually');
    return ok;
  }

  async function openChatGpt() {
    await copy();
    window.open(CHATGPT_URL, '_blank', 'noopener');
  }

  async function sharePhoto() {
    if (!photo) return;
    try {
      await copy();
      await navigator.share({ files: [photo], text: prompt });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast('Sharing didn’t work here. Open ChatGPT and attach the photo yourself.');
    }
  }

  return (
    <div className="stack">
      <div className="screen-head">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <Icon name="left" />
        </button>
        <h1>Estimate with ChatGPT</h1>
      </div>
      <p className="callout small">
        Only the description below{photo ? ' and the photo' : ''} goes to ChatGPT, and only when you paste or share it. Your weight, targets, and history stay on this device. ChatGPT’s answer is an estimate; you’ll review it before anything is saved.
      </p>
      {!online && (
        <p className="warn" role="status">
          <Icon name="offline" size={18} /> You’re offline. ChatGPT needs a connection, but you can copy the prompt now and use it later.
        </p>
      )}

      <Field label="Food description" htmlFor="gpt-desc">
        <textarea id="gpt-desc" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={photo ? 'Optional: add details the photo doesn’t show, like portion sizes or sauces.' : ''} />
      </Field>

      {photoUrl && (
        <figure className="photo-preview">
          <img src={photoUrl} alt="Selected food" />
          <figcaption>
            Kept in memory only; not saved.{' '}
            <button className="link" onClick={onRemovePhoto}>
              Remove photo
            </button>
          </figcaption>
        </figure>
      )}

      <ol className="steps">
        <li>
          <strong>Copy the prompt</strong> and open ChatGPT.
          <div className="row-wrap">
            <button className="btn" onClick={() => void copy()}>
              <Icon name="copy" size={18} /> Copy prompt
            </button>
            <button className="btn btn-primary" onClick={() => void openChatGpt()} disabled={!online}>
              <Icon name="external" size={18} /> Copy and open ChatGPT
            </button>
            {canSharePhoto && (
              <button className="btn" onClick={() => void sharePhoto()} disabled={!online}>
                Share photo and prompt
              </button>
            )}
          </div>
        </li>
        <li>
          <strong>Paste it into ChatGPT</strong>
          {photo ? ' and attach the photo (paperclip or + button), unless you shared it directly.' : '.'} Answer any follow-up question it asks.
        </li>
        <li>
          <strong>Copy ChatGPT’s whole answer</strong>, come back here, and paste it below. The JSON block at the end is what Tally reads.
        </li>
      </ol>

      <details className="prompt-preview">
        <summary>Show the prompt</summary>
        <textarea ref={promptRef} readOnly rows={12} value={prompt} aria-label="Prompt for ChatGPT" />
      </details>

      <Field label="ChatGPT’s answer" htmlFor="gpt-answer">
        <textarea id="gpt-answer" rows={6} value={pasted} onChange={(e) => { setPasted(e.target.value); setResult(null); }} placeholder="Paste the answer here" />
      </Field>
      <div className="row-wrap">
        <button className="btn btn-primary" disabled={!pasted.trim()} onClick={() => setResult(parseChatGptResponse(pasted))}>
          Read the answer
        </button>
        <button className="btn" onClick={onManual}>
          Enter values by hand instead
        </button>
      </div>

      {result && (
        <Section title={result.items.length ? `Found ${result.items.length} item${result.items.length === 1 ? '' : 's'}` : 'Nothing found'}>
          {result.errors.map((e) => (
            <p key={e} className="warn">
              {e}
            </p>
          ))}
          {result.items.length > 0 && (
            <>
              <table className="mini-table">
                <thead>
                  <tr>
                    <th scope="col">Food</th>
                    <th scope="col">kcal</th>
                    <th scope="col">P</th>
                    <th scope="col">C</th>
                    <th scope="col">F</th>
                    <th scope="col">Fib</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((it, i) => (
                    <tr key={i}>
                      <td>
                        {it.name}
                        <span className="muted small">
                          {' '}
                          {formatQuantity(it.quantity)} {it.unit}
                          {it.uncertain ? ', uncertain' : ''}
                        </span>
                        {it.problems.map((p) => (
                          <span key={p} className="problem block small">
                            {p}
                          </span>
                        ))}
                      </td>
                      <td>{fmtKcal(it.nutrients.calories)}</td>
                      <td>{fmtGrams(it.nutrients.protein)}</td>
                      <td>{fmtGrams(it.nutrients.carbs)}</td>
                      <td>{fmtGrams(it.nutrients.fat)}</td>
                      <td>{fmtGrams(it.nutrients.fiber)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.totals && Math.abs(result.totals.calories - result.items.reduce((a, i) => a + i.nutrients.calories, 0)) > 25 && (
                <p className="warn small">ChatGPT’s stated total ({fmtKcal(result.totals.calories)} kcal) doesn’t match its items. Tally adds up the items itself.</p>
              )}
              <button className="btn btn-primary" onClick={() => onImport(result, hashText(pasted))}>
                Review these items
              </button>
            </>
          )}
        </Section>
      )}
    </div>
  );
}
