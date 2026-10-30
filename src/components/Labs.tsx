import { useMemo, useState } from 'react';
import { useApp } from '../state';
import type { LabMarker, LabResult } from '../lib/types';
import { LAB_LABEL, LAB_MARKERS } from '../lib/types';
import { addDays, daysBetween, formatDate, isValidDateKey, nowIso, toDateKey } from '../lib/dates';
import { uid } from '../lib/id';
import * as db from '../lib/db';
import { Confirm, Dialog, Empty, Field, Icon, NumberInput, Section, Segmented } from './ui';
import { LineChart } from './Charts';
import type { LineSeries } from './Charts';

type Values = Record<LabMarker, number | null>;

const RANGE: Record<LabResult['unit'], [number, number]> = { 'mg/dL': [1, 1500], 'mmol/L': [0.05, 40] };

/** Checks a lab entry before saving. Returns an error message or null. */
export function labError(date: string, unit: LabResult['unit'], v: Values): string | null {
  if (!isValidDateKey(date) || date > toDateKey()) return 'Choose the test date (today or earlier).';
  const filled = LAB_MARKERS.filter((k) => v[k] !== null);
  if (!filled.length) return 'Enter at least one result.';
  const [lo, hi] = RANGE[unit];
  for (const k of filled) if (!(v[k]! >= lo && v[k]! <= hi)) return `${LAB_LABEL[k]} of ${v[k]} ${unit} is outside the plausible range. Check the unit.`;
  return null;
}

export function LabsSection() {
  const { data, reload, toast } = useApp();
  const d = data!;
  const [marker, setMarker] = useState<LabMarker>('ldl');
  const [editing, setEditing] = useState<LabResult | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<LabResult | null>(null);
  const labs = useMemo(() => [...d.labs].sort((a, b) => a.date.localeCompare(b.date)), [d.labs]);
  const pts = labs.filter((l) => typeof l[marker] === 'number');
  const unit = pts[pts.length - 1]?.unit ?? 'mg/dL';
  const sameUnit = pts.filter((l) => l.unit === unit);
  const origin = sameUnit[0]?.date ?? toDateKey();
  const series: LineSeries[] = sameUnit.length ? [{ name: `${LAB_LABEL[marker]} (measured)`, kind: 'actual', points: sameUnit.map((l) => ({ x: daysBetween(origin, l.date), y: l[marker]!, label: formatDate(l.date, { month: 'short', day: 'numeric', year: '2-digit' }) })) }] : [];
  const span = sameUnit.length ? Math.max(1, daysBetween(origin, sameUnit[sameUnit.length - 1].date)) : 1;

  return (
    <Section title="Blood tests (optional)" action={<button className="link" onClick={() => setEditing('new')}>Add result</button>}>
      <p className="muted small">Measured lab values you enter, kept separate from food estimates. Tally doesn’t predict blood cholesterol from what you eat, diagnose anything, or advise on medication.</p>
      {labs.length === 0 ? (
        <Empty title="No blood tests entered">Add your LDL, HDL, total cholesterol, and triglycerides from a lipid panel to see them over time. This is optional.</Empty>
      ) : (
        <>
          <Segmented label="Marker" value={marker} onChange={setMarker} options={LAB_MARKERS.map((k) => ({ value: k, label: k === 'triglycerides' ? 'Trig.' : k === 'total' ? 'Total' : k.toUpperCase() }))} />
          {sameUnit.length ? (
            <LineChart title={LAB_LABEL[marker]} unit={unit} series={series} xLabels={[0, span].map((x) => ({ x, label: formatDate(addDays(origin, x), { month: 'short', year: '2-digit' }) }))} />
          ) : (
            <p className="muted">No {LAB_LABEL[marker]} values entered.</p>
          )}
          {pts.length !== sameUnit.length && <p className="hint">Results in other units aren’t plotted together.</p>}
          <div className="table-scroll">
            <table className="mini-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">LDL</th>
                  <th scope="col">HDL</th>
                  <th scope="col">Total</th>
                  <th scope="col">Trig.</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...labs].reverse().map((l) => (
                  <tr key={l.id}>
                    <th scope="row">
                      {formatDate(l.date, { month: 'short', day: 'numeric', year: 'numeric' })}
                      <span className="muted small block">{l.unit}</span>
                    </th>
                    <td>{l.ldl ?? '–'}</td>
                    <td>{l.hdl ?? '–'}</td>
                    <td>{l.total ?? '–'}</td>
                    <td>{l.triglycerides ?? '–'}</td>
                    <td className="nowrap">
                      <button className="icon-btn sm" aria-label={`Edit result from ${l.date}`} onClick={() => setEditing(l)}>
                        <Icon name="settings" size={16} />
                      </button>
                      <button className="icon-btn sm" aria-label={`Delete result from ${l.date}`} onClick={() => setToDelete(l)}>
                        <Icon name="trash" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {editing && (
        <LabDialog
          existing={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={async (r) => {
            await db.put('labResults', { ...r, profileId: d.profile.id });
            setEditing(null);
            await reload();
            toast('Blood test saved');
          }}
        />
      )}
      {toDelete && (
        <Confirm
          title="Delete this result?"
          message={`Blood test from ${formatDate(toDelete.date)}.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            await db.remove('labResults', toDelete.id);
            setToDelete(null);
            await reload();
          }}
        />
      )}
    </Section>
  );
}

function LabDialog({ existing, onClose, onSave }: { existing?: LabResult; onClose: () => void; onSave: (r: LabResult) => void }) {
  const [date, setDate] = useState(existing?.date ?? toDateKey());
  const [unit, setUnit] = useState<LabResult['unit']>(existing?.unit ?? 'mg/dL');
  const [v, setV] = useState<Values>({ ldl: existing?.ldl ?? null, hdl: existing?.hdl ?? null, total: existing?.total ?? null, triglycerides: existing?.triglycerides ?? null });
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [touched, setTouched] = useState(false);
  const err = labError(date, unit, v);
  return (
    <Dialog
      title={existing ? 'Edit blood test' : 'Add blood test'}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setTouched(true);
              if (err) return;
              const now = nowIso();
              const r: LabResult = { id: existing?.id ?? uid(), profileId: existing?.profileId ?? '', date, unit, notes: notes.trim() || undefined, createdAt: existing?.createdAt ?? now, updatedAt: now };
              for (const k of LAB_MARKERS) if (v[k] !== null) r[k] = v[k]!;
              onSave(r);
            }}
          >
            Save result
          </button>
        </>
      }
    >
      <div className="grid2">
        <Field label="Test date" htmlFor="lab-date">
          <input id="lab-date" type="date" value={date} max={toDateKey()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Units" htmlFor="lab-unit" hint="US labs report mg/dL.">
          <select id="lab-unit" value={unit} onChange={(e) => setUnit(e.target.value as LabResult['unit'])}>
            <option value="mg/dL">mg/dL</option>
            <option value="mmol/L">mmol/L</option>
          </select>
        </Field>
      </div>
      <div className="grid2">
        {LAB_MARKERS.map((k) => (
          <Field key={k} label={LAB_LABEL[k]} htmlFor={`lab-${k}`}>
            <NumberInput id={`lab-${k}`} value={v[k]} onChange={(x) => setV({ ...v, [k]: x })} suffix={unit} />
          </Field>
        ))}
      </div>
      <Field label="Notes (optional)" htmlFor="lab-notes">
        <input id="lab-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Fasting, lab name…" />
      </Field>
      <p className="hint">Leave a field blank if it wasn’t measured.</p>
      {touched && err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
    </Dialog>
  );
}
