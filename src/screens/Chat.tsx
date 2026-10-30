import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useApp } from '../state';
import type { ProfileData } from '../state';
import type { ChatMessage, ExerciseEntry, FoodEntry, LoggedItem, MealCategory, Nutrients, WeightEntry } from '../lib/types';
import { MEALS, MEAL_LABEL, LAB_LABEL } from '../lib/types';
import { applyCorrection, classify, questionSubject, shortName, stripFraming } from '../lib/chat';
import type { NutrientWord, PendingLine } from '../lib/chat';
import { defaultMealFor, parseFoodText } from '../lib/parser';
import { entrySource, extCoverage, fmtGrams, fmtKcal, itemsTotals, recalcItem, roundStored, sumNutrients } from '../lib/nutrition';
import { addDays, formatDate, nowIso, toDateKey, toTimeKey, daysBetween } from '../lib/dates';
import { formatQuantity, unitLabel } from '../lib/units';
import { uid } from '../lib/id';
import { estimateExercise, ACTIVITY_BY_KEY } from '../lib/exercise';
import { labSummary, monthWeight, satFatCheck, weekReport } from '../lib/insights';
import { sortWeights } from '../lib/weight';
import { buildPlanPrompt, CHATGPT_URL } from '../lib/chatgpt';
import { cardOf, dayContext, loadChat, newMessage, recsCardFrom, recsFor, saveMessage, targetsOf } from '../coach';
import type { Card, ExerciseCard, FoodInfoCard, MealCard, RecsCard, WeightCard } from '../coach';
import * as db from '../lib/db';
import { Confirm, Icon } from '../components/ui';
import { LineChart } from '../components/Charts';
import type { LineSeries } from '../components/Charts';

const EXAMPLES = [
  'I had three eggs, two slices of toast with butter, and bacon',
  'What should I eat for dinner?',
  'High-protein dinner under 600 calories, low in saturated fat',
  'How much fiber do I have left today?',
  'I weighed 242 this morning',
  'How have I done this week?',
];

const NUTRIENT_TEXT: Record<NutrientWord, [string, string]> = {
  calories: ['calories', 'kcal'],
  protein: ['protein', 'g'],
  carbs: ['carbs', 'g'],
  fat: ['fat', 'g'],
  satFat: ['saturated fat', 'g'],
  fiber: ['fiber', 'g'],
  solubleFiber: ['soluble fiber', 'g'],
  cholesterol: ['dietary cholesterol', 'mg'],
  sodium: ['sodium', 'mg'],
};

function linesFromText(text: string, index: ReturnType<typeof useApp>['index']) {
  const r = parseFoodText(text, index);
  const lines: PendingLine[] = r.lines.map((l) => ({ key: l.id, item: l.item ?? null, raw: l.raw, notes: l.notes, needsUnit: l.needsUnit }));
  return { lines, restaurant: r.restaurant, dish: r.dish };
}

function lineBlocker(l: PendingLine): string | null {
  if (!l.item) return `“${l.raw}” isn’t in the food list`;
  if (l.needsUnit) return `pick a unit for ${shortName(l.item.name)}`;
  if (!(l.item.quantity > 0)) return `enter an amount for ${shortName(l.item.name)}`;
  return null;
}

export function ChatScreen() {
  const app = useApp();
  const { data, index, foodById, reload, toast, go, setFoodIntent, online } = app;
  const d = data!;
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [clearing, setClearing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const profileId = d.profile.id;

  useEffect(() => {
    let live = true;
    loadChat(profileId)
      .then((m) => live && setMsgs(m))
      .catch(() => live && setMsgs([]))
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [profileId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [msgs.length, loaded]);

  const push = useCallback(async (...list: ChatMessage[]) => {
    setMsgs((m) => [...m, ...list]);
    for (const m of list) await saveMessage(m);
  }, []);

  const update = useCallback(async (m: ChatMessage, card: Card, textOverride?: string) => {
    const next = { ...m, card, text: textOverride ?? m.text, updatedAt: nowIso() };
    setMsgs((all) => all.map((x) => (x.id === m.id ? next : x)));
    await saveMessage(next);
  }, []);

  const reply = (t: string, card?: Card) => newMessage(profileId, 'tally', t, card);
  const latestPending = (): ChatMessage | undefined => [...msgs].reverse().find((m) => cardOf(m)?.type === 'meal' && (cardOf(m) as MealCard).status === 'pending');

  async function send(raw: string) {
    const t = raw.trim();
    if (!t) return;
    setText('');
    const user = newMessage(profileId, 'user', t);
    const pending = latestPending();
    const intent = classify(t, !!pending);
    const out: ChatMessage[] = [];
    const ctx = dayContext(d);

    switch (intent.kind) {
      case 'log_food': {
        const { lines, restaurant, dish } = linesFromText(stripFraming(t), index);
        if (!lines.length) {
          out.push(reply('I didn’t find any food in that. Try something like “two eggs and a slice of toast,” or ask me a question.'));
          break;
        }
        const date = addDays(toDateKey(), intent.dayOffset);
        const card: MealCard = { type: 'meal', status: 'pending', meal: intent.meal ?? defaultMealFor(new Date(), d.profile.mealBoundaries), date, time: toTimeKey(), lines, sourceText: t, restaurant, dish };
        const unmatched = lines.filter((l) => !l.item).length;
        const msg = restaurant || dish
          ? 'Here’s a rough local estimate. Restaurant meals and mixed dishes vary a lot, so ChatGPT will usually do better on this one. Review it, then save.'
          : unmatched
            ? `I matched ${lines.length - unmatched} of ${lines.length} items. ${unmatched === 1 ? 'One isn’t' : 'Some aren’t'} in the food list; remove ${unmatched === 1 ? 'it' : 'them'}, edit, or ask ChatGPT.`
            : 'Here’s what I found. Check the amounts, then save. Nothing is logged until you do.';
        out.push(reply(msg, card));
        break;
      }
      case 'correct': {
        const m = pending!;
        const c = cardOf(m) as MealCard;
        const r = applyCorrection(c.lines, t, index, foodById);
        if (!r.understood) {
          out.push(reply('I couldn’t tell what to change. Edit the amounts on the card directly, or say something like “only half a tablespoon of butter” or “remove the bacon.”'));
          break;
        }
        await update(m, { ...c, lines: r.lines });
        out.push(reply(`${r.changes.join(' ')} The meal card is updated; it still isn’t saved.`));
        break;
      }
      case 'food_question': {
        const subject = questionSubject(t);
        const { lines } = linesFromText(subject, index);
        const known = lines.filter((l) => l.item);
        if (!known.length) {
          out.push(reply(`“${subject || t}” isn’t something I can look up in the local food list. If it’s a food, ChatGPT can estimate it; tap Ask ChatGPT and I’ll prepare the prompt. Nothing gets logged unless you save it.`, { type: 'foodinfo', lines, text: subject }));
          break;
        }
        out.push(reply('Here’s roughly what that is. This is just information; it’s not logged.', { type: 'foodinfo', lines, text: subject } as FoodInfoCard));
        break;
      }
      case 'remaining': {
        out.push(reply(remainingText(ctx.targets, ctx.totals, ctx.items, intent.nutrient, ctx.entries.length)));
        break;
      }
      case 'today': {
        out.push(reply(todayText(ctx.targets, ctx.totals, ctx.items, ctx.entries.length, d)));
        break;
      }
      case 'recommend': {
        const r = recsFor(d, { meal: intent.meal, constraints: intent.constraints });
        if (!r.suggestions.length) {
          out.push(reply(`${r.headline} Nothing in my meal list fits those limits (${r.budget} kcal available for this meal). ChatGPT can plan something custom.`, recsCardFrom(r, t)));
        } else out.push(reply(r.headline, recsCardFrom(r, t)));
        break;
      }
      case 'weight': {
        out.push(reply(`Record ${intent.weight} lb for ${intent.dayOffset ? 'yesterday' : 'today'}?`, { type: 'weight', status: 'pending', weight: intent.weight, date: addDays(toDateKey(), intent.dayOffset) }));
        break;
      }
      case 'exercise': {
        const def = ACTIVITY_BY_KEY[intent.activity];
        out.push(reply('Log this workout? The calorie figure is an estimate and doesn’t change your food budget.', { type: 'exercise', status: 'pending', activity: intent.activity, name: def?.label ?? 'Workout', date: toDateKey(), durationMin: intent.minutes, distanceMi: intent.distanceMi, intensity: intent.intensity ?? 'moderate' }));
        break;
      }
      case 'week_report':
        out.push(reply(weekReport(d.food, d.exercise, d.days, ctx.targets, toDateKey()).lines.join('\n\n')));
        break;
      case 'satfat_check':
        out.push(reply(satFatCheck(d.food, d.exercise, d.days, ctx.targets, toDateKey()).lines.join('\n\n')));
        break;
      case 'month_weight':
        out.push(reply(monthWeight(d.weights, toDateKey()).lines.join('\n\n')));
        break;
      case 'labs': {
        const r = labSummary(d.labs, /hdl/i.test(t) ? 'hdl' : /triglycer/i.test(t) ? 'triglycerides' : /total/i.test(t) ? 'total' : 'ldl');
        out.push(reply(r.lines.join('\n\n'), r.enough ? { type: 'labs' } : undefined));
        break;
      }
      case 'help':
        out.push(reply(HELP));
        break;
      default:
        out.push(reply(`I’m not sure what you meant. ${HELP}`));
    }
    await push(user, ...out);
  }

  // ---------- card actions ----------

  async function saveMeal(m: ChatMessage, c: MealCard) {
    const items = c.lines.map((l) => ({ ...l.item!, nutrients: roundStored(l.item!.nutrients) }));
    const now = nowIso();
    const entry: FoodEntry = { id: uid(), profileId, date: c.date, time: c.time, meal: c.meal, items, totals: itemsTotals(items), sourceType: entrySource(items), estimated: items.some((i) => i.estimated), notes: c.sourceText.slice(0, 280), createdAt: now, updatedAt: now };
    try {
      await db.put('foodEntries', entry);
      void db.requestPersistence();
    } catch (e) {
      toast(`Couldn’t save: ${e instanceof Error ? e.message : e}`);
      return;
    }
    await update(m, { ...c, status: 'saved', entryId: entry.id });
    await reload();
    // coach on the updated day: same data the dashboard will show
    const after: ProfileData = { ...d, food: [...d.food, entry] };
    if (c.date === toDateKey()) {
      const r = recsFor(after, { limit: 2 });
      await push(reply(`Saved to ${MEAL_LABEL[c.meal].toLowerCase()}. ${r.headline}`, r.suggestions.length ? recsCardFrom(r) : undefined));
    } else await push(reply(`Saved to ${MEAL_LABEL[c.meal].toLowerCase()} on ${formatDate(c.date)}.`));
  }

  function openInFoodScreen(m: ChatMessage, c: MealCard, gpt: boolean) {
    setFoodIntent(
      gpt
        ? { text: c.sourceText, startPhase: 'chatgpt', meal: c.meal, date: c.date, chatMessageId: m.id, returnTo: 'chat' }
        : { items: c.lines.filter((l) => l.item).map((l) => l.item!), meal: c.meal, date: c.date, chatMessageId: m.id, returnTo: 'chat' },
    );
    go('food');
  }

  async function saveWeight(m: ChatMessage, c: WeightCard) {
    const now = nowIso();
    const prev = sortWeights(d.weights).filter((w) => w.date <= c.date).pop();
    const entry: WeightEntry = { id: uid(), profileId, date: c.date, weight: c.weight, createdAt: now, updatedAt: now };
    await db.put('weightEntries', entry);
    const latest = sortWeights([...d.weights, entry]).pop()!;
    if (latest.weight !== d.profile.currentWeight) await db.put('profiles', { ...d.profile, currentWeight: latest.weight, updatedAt: now });
    await update(m, { ...c, status: 'saved' });
    await reload();
    let t = `Saved ${c.weight} lb.`;
    if (prev) {
      const diff = c.weight - prev.weight;
      t += ` That’s ${Math.abs(diff) < 0.05 ? 'the same as' : `${diff < 0 ? 'down' : 'up'} ${Math.abs(diff).toFixed(1)} lb from`} your last weigh-in (${formatDate(prev.date, { month: 'short', day: 'numeric' })}, ${daysBetween(prev.date, c.date)} days earlier).`;
    }
    const toGo = c.weight - d.profile.targetWeight;
    if (toGo > 0) t += ` ${toGo.toFixed(1)} lb to your ${d.profile.targetWeight} lb target.`;
    t += ' Single weigh-ins bounce with water; the trend over several weeks is what counts.';
    await push(reply(t));
  }

  async function saveExercise(m: ChatMessage, c: ExerciseCard) {
    const w = sortWeights(d.weights).pop()?.weight ?? d.profile.currentWeight;
    const est = estimateExercise(c.activity, c.durationMin, w, c.intensity, c.distanceMi);
    if (!est) return;
    const now = nowIso();
    const entry: ExerciseEntry = { id: uid(), profileId, date: c.date, activity: c.activity, name: c.name, durationMin: c.durationMin, distanceMi: c.distanceMi, intensity: c.intensity, estimatedCalories: est.calories, estimationMethod: est.method, createdAt: now, updatedAt: now };
    await db.put('exerciseEntries', entry);
    await update(m, { ...c, status: 'saved' });
    await reload();
    await push(reply(`Logged ${c.name.toLowerCase()}, ${Math.round(c.durationMin)} min, about ${est.calories} kcal above resting. Your food budget stays the same.`));
  }

  async function logSuggestion(items: LoggedItem[], meal: MealCategory, name: string) {
    const card: MealCard = { type: 'meal', status: 'pending', meal, date: toDateKey(), time: toTimeKey(), lines: items.map((i) => ({ key: uid(), item: { ...i, id: uid() }, raw: i.name, notes: [] })), sourceText: name };
    await push(reply(`“${name}” is ready to log. Adjust the amounts to what you actually ate, then save.`, card));
  }

  async function clearChat() {
    for (const m of msgs) await db.remove('chatMessages', m.id);
    setMsgs([]);
    setClearing(false);
    toast('Chat cleared. Your logged records are unchanged.');
  }

  const empty = loaded && msgs.length === 0;

  return (
    <div className="chat">
      <div className="chat-head">
        <h1>Chat</h1>
        {msgs.length > 0 && (
          <button className="link small" onClick={() => setClearing(true)}>
            Clear chat
          </button>
        )}
      </div>
      <div className="chat-log" role="log" aria-live="polite" aria-label="Conversation">
        {empty && (
          <div className="chat-welcome">
            <p className="chat-hello">Hi {d.profile.name}. Tell me what you ate, ask what to eat next, or ask how your week went.</p>
            <p className="muted small">Everything is worked out on this device. Nothing is logged until you tap Save.</p>
            <div className="chips">
              {EXAMPLES.map((e) => (
                <button key={e} className="chip" onClick={() => void send(e)}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m) => (
          <Message key={m.id} m={m}>
            <CardView
              m={m}
              d={d}
              online={online}
              onUpdate={(c) => void update(m, c)}
              onSaveMeal={(c) => void saveMeal(m, c)}
              onOpenFood={(c, gpt) => openInFoodScreen(m, c, gpt)}
              onSaveWeight={(c) => void saveWeight(m, c)}
              onSaveExercise={(c) => void saveExercise(m, c)}
              onLog={(items, meal, name) => void logSuggestion(items, meal, name)}
              onAskGptText={(t) => {
                setFoodIntent({ text: t, startPhase: 'chatgpt', returnTo: 'chat' });
                go('food');
              }}
            />
          </Message>
        ))}
        <div ref={endRef} />
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <button type="button" className="icon-btn" aria-label="Estimate from a photo with ChatGPT" onClick={() => fileRef.current?.click()}>
          <Icon name="camera" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="visually-hidden"
          tabIndex={-1}
          aria-label="Food photo"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setFoodIntent({ startPhase: 'chatgpt', photo: f, text: text.trim(), returnTo: 'chat' });
            go('food');
          }}
        />
        <label htmlFor="chat-text" className="visually-hidden">
          Message
        </label>
        <textarea
          id="chat-text"
          ref={inputRef}
          rows={1}
          value={text}
          placeholder="What did you eat? Or ask a question"
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(140, e.target.scrollHeight)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send(text);
            }
          }}
        />
        <button type="submit" className="btn btn-primary send" disabled={!text.trim()} aria-label="Send">
          Send
        </button>
      </form>
      {clearing && <Confirm title="Clear this chat?" message="This removes the conversation only. Logged food, workouts, and weigh-ins stay." confirmLabel="Clear chat" danger onCancel={() => setClearing(false)} onConfirm={() => void clearChat()} />}
    </div>
  );
}

const HELP = 'You can say things like:\n• “I had oatmeal with blueberries for breakfast”\n• “Actually, only half a tablespoon of butter”\n• “What should I eat for dinner?” or “high-protein lunch under 500 calories”\n• “How much protein do I have left?”\n• “I weighed 241.6 this morning” or “walked 40 minutes”\n• “How have I done this week?” or “Show my LDL results”';

function Message({ m, children }: { m: ChatMessage; children: ReactNode }) {
  return (
    <div className={`msg msg-${m.role}`}>
      {m.text && <p className="msg-text">{m.text}</p>}
      {children}
    </div>
  );
}

// ---------- text answers ----------

function coverageNote(items: LoggedItem[], key: 'satFat' | 'solubleFiber' | 'cholesterol' | 'sodium'): string {
  const c = extCoverage(items, key);
  if (c.complete || !c.total) return '';
  return ` (${c.total - c.known} of ${c.total} items have no value for this, so the real total is higher)`;
}

function remainingText(t: ReturnType<typeof targetsOf>, tot: Nutrients, items: LoggedItem[], key: NutrientWord | undefined, entries: number): string {
  if (!entries) return `Nothing is logged today yet, so you have your full targets: ${fmtKcal(t.calories)} kcal, ${t.protein} g protein, ${t.fiber} g fiber, and a ${t.satFat} g saturated-fat limit.`;
  const one = (k: NutrientWord) => {
    const [label, unit] = NUTRIENT_TEXT[k];
    const target = k === 'cholesterol' ? undefined : (t[k as keyof typeof t] as number | undefined);
    const have = (tot[k as keyof Nutrients] as number | undefined) ?? 0;
    const cov = k === 'satFat' || k === 'solubleFiber' || k === 'sodium' || k === 'cholesterol' ? coverageNote(items, k) : '';
    if (target === undefined) return `You’ve had about ${Math.round(have)} ${unit} of ${label} today${cov}. There’s no daily limit set for it; it matters less for LDL than saturated fat.`;
    const left = target - have;
    const limit = k === 'satFat' || k === 'sodium';
    if (limit) return left >= 0 ? `You have about ${Math.round(left)} ${unit} of ${label} left (${Math.round(have)} of ${target} ${unit})${cov}.` : `You’re ${Math.round(-left)} ${unit} over your ${label} limit (${Math.round(have)} of ${target} ${unit})${cov}.`;
    return left > 0 ? `You need about ${Math.round(left)} ${unit} more ${label} (${Math.round(have)} of ${target} ${unit})${cov}.` : `You’ve met your ${label} target (${Math.round(have)} of ${target} ${unit}).`;
  };
  if (key) return one(key);
  return [one('calories'), one('protein'), one('satFat'), one('fiber')].join(' ');
}

function todayText(t: ReturnType<typeof targetsOf>, tot: Nutrients, items: LoggedItem[], entries: number, d: ProfileData): string {
  if (!entries) return 'Nothing logged today yet. Tell me what you’ve eaten and I’ll keep the totals.';
  const ex = d.exercise.filter((e) => e.date === toDateKey());
  const lines = [
    `Today so far (${entries} ${entries === 1 ? 'entry' : 'entries'}): ${fmtKcal(tot.calories)} of ${fmtKcal(t.calories)} kcal, ${fmtGrams(tot.protein)} of ${t.protein} g protein, ${fmtGrams(tot.fiber)} of ${t.fiber} g fiber.`,
    `Saturated fat ${fmtGrams(tot.satFat ?? 0)} of ${t.satFat} g${coverageNote(items, 'satFat')}. Sodium about ${fmtKcal(tot.sodium ?? 0)} of ${fmtKcal(t.sodium)} mg.`,
  ];
  if (ex.length) lines.push(`Exercise: ${ex.length} workout${ex.length === 1 ? '' : 's'}, about ${ex.reduce((a, e) => a + e.estimatedCalories, 0)} kcal (shown separately, not added to your food budget).`);
  return lines.join(' ');
}

// ---------- cards ----------

interface CardProps {
  m: ChatMessage;
  d: ProfileData;
  online: boolean;
  onUpdate: (c: Card) => void;
  onSaveMeal: (c: MealCard) => void;
  onOpenFood: (c: MealCard, gpt: boolean) => void;
  onSaveWeight: (c: WeightCard) => void;
  onSaveExercise: (c: ExerciseCard) => void;
  onLog: (items: LoggedItem[], meal: MealCategory, name: string) => void;
  onAskGptText: (text: string) => void;
}

function CardView(p: CardProps) {
  const c = cardOf(p.m);
  if (!c) return null;
  switch (c.type) {
    case 'meal':
      return <MealCardView {...p} c={c} />;
    case 'recs':
      return <RecsCardView {...p} c={c} />;
    case 'weight':
      return (
        <ConfirmCard status={c.status} savedText={`Saved ${c.weight} lb`} onSave={() => p.onSaveWeight(c)} onDiscard={() => p.onUpdate({ ...c, status: 'discarded' })}>
          <p className="card-title">
            {c.weight} lb, {formatDate(c.date, { weekday: 'short', month: 'short', day: 'numeric' })}
          </p>
        </ConfirmCard>
      );
    case 'exercise': {
      const w = sortWeights(p.d.weights).pop()?.weight ?? p.d.profile.currentWeight;
      const est = estimateExercise(c.activity, c.durationMin, w, c.intensity, c.distanceMi);
      return (
        <ConfirmCard status={c.status} savedText="Workout saved" onSave={() => p.onSaveExercise(c)} onDiscard={() => p.onUpdate({ ...c, status: 'discarded' })}>
          <p className="card-title">
            {c.name}, {Math.round(c.durationMin)} min{c.distanceMi ? `, ${c.distanceMi} mi` : ''}, {c.intensity}
          </p>
          {est && <p className="muted small">About {est.calories} kcal above resting (estimate).</p>}
        </ConfirmCard>
      );
    }
    case 'labs':
      return <LabsMini d={p.d} />;
    case 'foodinfo':
      return <FoodInfoView {...p} c={c} />;
    default:
      return null;
  }
}

function ConfirmCard({ status, savedText, onSave, onDiscard, children }: { status: 'pending' | 'saved' | 'discarded'; savedText: string; onSave: () => void; onDiscard: () => void; children: ReactNode }) {
  return (
    <div className={`card card-${status}`}>
      {children}
      {status === 'pending' ? (
        <div className="row-wrap">
          <button className="btn btn-primary btn-small" onClick={onSave}>
            Save
          </button>
          <button className="btn btn-small" onClick={onDiscard}>
            Discard
          </button>
        </div>
      ) : (
        <p className="card-status">{status === 'saved' ? `✓ ${savedText}` : 'Discarded'}</p>
      )}
    </div>
  );
}

function Impact({ d, add, date }: { d: ProfileData; add: Nutrients; date: string }) {
  const ctx = dayContext(d, date);
  const after = sumNutrients([ctx.totals, add]);
  const t = ctx.targets;
  const left = t.calories - after.calories;
  const satLeft = t.satFat - (after.satFat ?? 0);
  return (
    <p className="impact">
      After this: <strong>{left >= 0 ? `${fmtKcal(left)} kcal left` : `${fmtKcal(-left)} kcal over`}</strong>, saturated fat {fmtGrams(after.satFat ?? 0)} of {t.satFat} g{satLeft < 0 ? ' (over)' : ''}, fiber {fmtGrams(after.fiber)} of {t.fiber} g, protein {fmtGrams(after.protein)} of {t.protein} g.
    </p>
  );
}

function MealCardView({ c, d, onUpdate, onSaveMeal, onOpenFood, online, foodHint }: CardProps & { c: MealCard; foodHint?: string }) {
  const { foodById } = useApp();
  void foodHint;
  const items = c.lines.filter((l) => l.item).map((l) => l.item!);
  const totals = itemsTotals(items);
  const blockers = c.lines.map(lineBlocker).filter(Boolean) as string[];
  const pending = c.status === 'pending';
  const setLine = (key: string, fn: (l: PendingLine) => PendingLine | null) => {
    const lines = c.lines.map((l) => (l.key === key ? fn(l) : l)).filter(Boolean) as PendingLine[];
    onUpdate({ ...c, lines });
  };

  return (
    <div className={`card meal-card card-${c.status}`}>
      <div className="card-row">
        {pending ? (
          <select aria-label="Meal" value={c.meal} onChange={(e) => onUpdate({ ...c, meal: e.target.value as MealCategory })} className="meal-select">
            {MEALS.map((m) => (
              <option key={m} value={m}>
                {m === 'snack' ? 'Snack' : MEAL_LABEL[m]}
              </option>
            ))}
          </select>
        ) : (
          <span className="card-title">{MEAL_LABEL[c.meal]}</span>
        )}
        <span className="muted small">{c.date === toDateKey() ? 'Today' : formatDate(c.date)}</span>
      </div>
      <ul className="mc-items">
        {c.lines.map((l) => (
          <li key={l.key} className={l.item ? (l.item.estimated || l.notes.length ? 'est' : '') : 'unmatched'}>
            {l.item ? (
              <>
                <div className="mc-line">
                  <span className="mc-name">{shortName(l.item.name)}</span>
                  {pending ? (
                    <span className="mc-qty">
                      <input
                        aria-label={`Amount of ${shortName(l.item.name)}`}
                        inputMode="decimal"
                        defaultValue={formatQuantity(l.item.quantity)}
                        onBlur={(e) => {
                          const v = Number(e.target.value.replace(',', '.'));
                          if (!(v > 0) || v === l.item!.quantity) {
                            e.target.value = formatQuantity(l.item!.quantity);
                            return;
                          }
                          const next = { ...l.item!, quantity: v, estimated: false };
                          const n = recalcItem(next, foodById(next.foodId));
                          setLine(l.key, (x) => ({ ...x, item: n ? { ...next, nutrients: n } : next, notes: n ? [] : ['Amount changed; nutrition not recalculated.'] }));
                        }}
                      />
                      <span className="muted">{unitLabel(l.item.unit, l.item.quantity)}</span>
                    </span>
                  ) : (
                    <span className="muted">
                      {formatQuantity(l.item.quantity)} {unitLabel(l.item.unit, l.item.quantity)}
                    </span>
                  )}
                  <span className="mc-kcal">{fmtKcal(l.item.nutrients.calories)}</span>
                  {pending && (
                    <button className="icon-btn sm" aria-label={`Remove ${shortName(l.item.name)}`} onClick={() => setLine(l.key, () => null)}>
                      <Icon name="close" size={16} />
                    </button>
                  )}
                </div>
                <div className="mc-macros muted">
                  P {fmtGrams(l.item.nutrients.protein)} · Sat fat {l.item.nutrients.satFat === undefined ? '?' : fmtGrams(l.item.nutrients.satFat)} · Fiber {fmtGrams(l.item.nutrients.fiber)}
                  {l.item.source === 'ai' ? ' · ChatGPT estimate' : l.item.estimated ? ' · estimated amount' : ''}
                </div>
                {pending && l.notes.length > 0 && <div className="mc-note">{l.notes[0]}</div>}
              </>
            ) : (
              <div className="mc-line">
                <span className="mc-name">“{l.raw}” isn’t in the food list</span>
                {pending && (
                  <button className="icon-btn sm" aria-label={`Remove ${l.raw}`} onClick={() => setLine(l.key, () => null)}>
                    <Icon name="close" size={16} />
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="mc-total">
        <span>
          <strong>{fmtKcal(totals.calories)}</strong> kcal
        </span>
        <span>P {fmtGrams(totals.protein)} g</span>
        <span>Sat fat {fmtGrams(totals.satFat ?? 0)} g</span>
        <span>Fiber {fmtGrams(totals.fiber)} g</span>
      </div>
      {pending && items.length > 0 && <Impact d={d} add={totals} date={c.date} />}
      {pending ? (
        <>
          {blockers.length > 0 && <p className="mc-block">Before saving: {blockers.join('; ')}.</p>}
          <div className="row-wrap">
            <button className="btn btn-primary btn-small" disabled={!items.length || blockers.length > 0} onClick={() => onSaveMeal(c)}>
              Save
            </button>
            <button className="btn btn-small" onClick={() => onOpenFood(c, false)} disabled={!items.length}>
              Edit details
            </button>
            {(c.restaurant || c.dish || c.lines.some((l) => !l.item)) && (
              <button className="btn btn-small" onClick={() => onOpenFood(c, true)} disabled={!online} title={online ? undefined : 'Needs a connection'}>
                Ask ChatGPT
              </button>
            )}
            <button className="btn btn-small" onClick={() => onUpdate({ ...c, status: 'discarded' })}>
              Discard
            </button>
          </div>
        </>
      ) : (
        <p className="card-status">{c.status === 'saved' ? '✓ Saved to your log' : 'Discarded, not logged'}</p>
      )}
    </div>
  );
}

function RecsCardView({ c, onLog, online }: CardProps & { c: RecsCard }) {
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  async function askGpt() {
    const prompt = buildPlanPrompt({ request: c.request ?? '', remaining: c.remaining, meal: MEAL_LABEL[c.meal].toLowerCase() });
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      setCopied(false);
    }
    window.open(CHATGPT_URL, '_blank', 'noopener');
  }
  return (
    <div className="card recs-card">
      {c.suggestions.map((s) => (
        <div key={s.id} className="rec">
          <div className="rec-head">
            <span className="card-title">{s.name}</span>
            <span className="rec-kcal">{fmtKcal(s.totals.calories)} kcal</span>
          </div>
          <p className="rec-macros muted small">
            P {fmtGrams(s.totals.protein)} g · Sat fat {fmtGrams(s.totals.satFat ?? 0)} g · Fiber {fmtGrams(s.totals.fiber)} g{s.totals.solubleFiber ? ` (≈${s.totals.solubleFiber.toFixed(1)} soluble)` : ''} · Sodium {fmtKcal(s.totals.sodium ?? 0)} mg
          </p>
          <ul className="rec-why">
            {s.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {open === s.id && (
            <ul className="rec-items small">
              {s.items.map((i) => (
                <li key={i.id}>
                  {formatQuantity(i.quantity)} {unitLabel(i.unit, i.quantity)} {shortName(i.name)}
                </li>
              ))}
            </ul>
          )}
          <div className="row-wrap">
            <button className="btn btn-small btn-primary" onClick={() => onLog(s.items, c.meal, s.name)}>
              Log this
            </button>
            <button className="btn btn-small" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
              {open === s.id ? 'Hide portions' : 'Portions'}
            </button>
          </div>
        </div>
      ))}
      <div className="rec-gpt">
        <button className="link small" onClick={() => void askGpt()} disabled={!online}>
          {copied ? 'Prompt copied. Paste it into ChatGPT' : 'Want other ideas? Copy a prompt and open ChatGPT'}
        </button>
        <span className="muted small"> Shares only today’s remaining calories, protein, saturated fat, and fiber.</span>
      </div>
    </div>
  );
}

function FoodInfoView({ c, d, onLog, onAskGptText, online }: CardProps & { c: FoodInfoCard }) {
  const items = c.lines.filter((l) => l.item).map((l) => l.item!);
  const totals = itemsTotals(items);
  const unmatched = c.lines.filter((l) => !l.item);
  return (
    <div className="card">
      {items.length > 0 && (
        <>
          <ul className="rec-items">
            {items.map((i) => (
              <li key={i.id}>
                {formatQuantity(i.quantity)} {unitLabel(i.unit, i.quantity)} {shortName(i.name)}: {fmtKcal(i.nutrients.calories)} kcal, P {fmtGrams(i.nutrients.protein)} g, sat fat {i.nutrients.satFat === undefined ? 'unknown' : `${fmtGrams(i.nutrients.satFat)} g`}, fiber {fmtGrams(i.nutrients.fiber)} g
              </li>
            ))}
          </ul>
          <Impact d={d} add={totals} date={toDateKey()} />
          {items.some((i) => i.estimated) && <p className="muted small">Amount assumed where you didn’t give one.</p>}
        </>
      )}
      <div className="row-wrap">
        {items.length > 0 && (
          <button className="btn btn-small" onClick={() => onLog(items, defaultMealFor(new Date(), d.profile.mealBoundaries), c.text)}>
            I ate this, log it
          </button>
        )}
        {(unmatched.length > 0 || !items.length) && (
          <button className="btn btn-small" onClick={() => onAskGptText(c.text)} disabled={!online}>
            Ask ChatGPT
          </button>
        )}
      </div>
    </div>
  );
}

function LabsMini({ d }: { d: ProfileData }) {
  const series = useMemo<LineSeries[]>(() => {
    const pts = [...d.labs].filter((l) => typeof l.ldl === 'number').sort((a, b) => a.date.localeCompare(b.date));
    if (!pts.length) return [];
    const o = pts[0].date;
    return [{ name: `${LAB_LABEL.ldl} (measured)`, kind: 'actual', points: pts.map((l) => ({ x: daysBetween(o, l.date), y: l.ldl!, label: formatDate(l.date, { month: 'short', year: '2-digit' }) })) }];
  }, [d.labs]);
  if (!series.length) return null;
  const pts = series[0].points;
  const span = Math.max(1, pts[pts.length - 1].x);
  return (
    <div className="card">
      <LineChart series={series} title="LDL cholesterol" unit={d.labs[0]?.unit ?? 'mg/dL'} height={150} xLabels={[{ x: 0, label: pts[0].label }, { x: span, label: pts[pts.length - 1].label }]} />
    </div>
  );
}
