import { useState } from 'react';

/**
 * Small SVG charts. No dependency, responsive via viewBox, readable on narrow screens.
 * Null values render as gaps labeled "no data", never as zero.
 */

export interface BarDatum {
  label: string;
  value: number | null;
  detail?: string;
}

const W = 340;

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
}

export function BarChart({ data, target, unit, height = 170, title, tone = 'ink' }: { data: BarDatum[]; target?: number; unit: string; height?: number; title: string; tone?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const values = data.map((d) => d.value ?? 0);
  const max = niceMax(Math.max(...values, target ?? 0) * 1.05);
  const padL = 34;
  const padB = 22;
  const padT = 8;
  const innerW = W - padL - 4;
  const innerH = height - padB - padT;
  const bw = innerW / Math.max(1, data.length);
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const labelEvery = Math.ceil(data.length / 7);
  const shown = active !== null ? data[active] : null;
  const hasAny = data.some((d) => d.value !== null);

  return (
    <figure className={`chart tone-${tone}`}>
      <figcaption>
        <span className="chart-title">{title}</span>
        <span className="chart-readout" aria-live="polite">
          {shown ? `${shown.label}: ${shown.value === null ? 'no data' : `${Math.round(shown.value).toLocaleString()} ${unit}`}${shown.detail ? ` (${shown.detail})` : ''}` : target ? `Target ${Math.round(target).toLocaleString()} ${unit}` : ''}
        </span>
      </figcaption>
      {!hasAny ? (
        <p className="chart-empty">No data in this range.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`${title}. ${data.map((d) => `${d.label} ${d.value === null ? 'no data' : Math.round(d.value)}`).join(', ')}`}>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={padL} x2={W - 4} y1={y(max * f)} y2={y(max * f)} className="grid" />
              <text x={padL - 4} y={y(max * f) + 3} className="axis" textAnchor="end">
                {Math.round(max * f).toLocaleString()}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = padL + i * bw;
            const w = Math.max(2, bw * 0.68);
            const cx = x + (bw - w) / 2;
            return (
              <g
                key={i}
                tabIndex={0}
                role="button"
                aria-label={`${d.label}: ${d.value === null ? 'no data' : Math.round(d.value) + ' ' + unit}`}
                onFocus={() => setActive(i)}
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive(i)}
                onBlur={() => setActive(null)}
                className={`bar-g${active === i ? ' active' : ''}`}
              >
                <rect x={x} y={padT} width={bw} height={innerH} className="hit" />
                {d.value === null ? (
                  <text x={x + bw / 2} y={padT + innerH - 3} className="nodata" textAnchor="middle">
                    –
                  </text>
                ) : (
                  <rect x={cx} y={y(d.value)} width={w} height={Math.max(0, padT + innerH - y(d.value))} className={`bar${target && d.value > target ? ' over' : ''}`} rx={1.5} />
                )}
                {i % labelEvery === 0 && (
                  <text x={x + bw / 2} y={height - 6} className="axis" textAnchor="middle">
                    {d.label}
                  </text>
                )}
                <title>{`${d.label}: ${d.value === null ? 'no data' : Math.round(d.value) + ' ' + unit}`}</title>
              </g>
            );
          })}
          {target ? <line x1={padL} x2={W - 4} y1={y(target)} y2={y(target)} className="target" /> : null}
        </svg>
      )}
    </figure>
  );
}

export interface LinePoint {
  x: number; // day offset
  y: number;
  label: string;
}

export interface LineSeries {
  name: string;
  points: LinePoint[];
  kind: 'actual' | 'trend' | 'target';
}

export function LineChart({ series, title, unit, height = 190, xLabels }: { series: LineSeries[]; title: string; unit: string; height?: number; xLabels: { x: number; label: string }[] }) {
  const [active, setActive] = useState<LinePoint | null>(null);
  const pts = series.flatMap((s) => s.points);
  if (!pts.length) {
    return (
      <figure className="chart">
        <figcaption>
          <span className="chart-title">{title}</span>
        </figcaption>
        <p className="chart-empty">No weigh-ins yet.</p>
      </figure>
    );
  }
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs, xmin + 1);
  let ymin = Math.min(...ys);
  let ymax = Math.max(...ys);
  const pad = Math.max(1, (ymax - ymin) * 0.12);
  ymin = Math.floor(ymin - pad);
  ymax = Math.ceil(ymax + pad);
  const padL = 34;
  const padB = 22;
  const padT = 10;
  const innerW = W - padL - 10;
  const innerH = height - padB - padT;
  const sx = (x: number) => padL + ((x - xmin) / (xmax - xmin)) * innerW;
  const sy = (v: number) => padT + innerH - ((v - ymin) / (ymax - ymin)) * innerH;
  const actual = series.find((s) => s.kind === 'actual');

  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">{title}</span>
        <span className="chart-readout" aria-live="polite">
          {active ? `${active.label}: ${active.y.toFixed(1)} ${unit}` : ''}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`${title}. ${actual ? actual.points.map((p) => `${p.label} ${p.y.toFixed(1)}`).join(', ') : ''}`}>
        {[0, 0.5, 1].map((f) => {
          const v = ymin + (ymax - ymin) * f;
          return (
            <g key={f}>
              <line x1={padL} x2={W - 10} y1={sy(v)} y2={sy(v)} className="grid" />
              <text x={padL - 4} y={sy(v) + 3} className="axis" textAnchor="end">
                {Math.round(v)}
              </text>
            </g>
          );
        })}
        {xLabels.map((l) => (
          <text key={l.x} x={sx(l.x)} y={height - 6} className="axis" textAnchor="middle">
            {l.label}
          </text>
        ))}
        {series.map((s) => (
          <polyline key={s.name} className={`line line-${s.kind}`} points={s.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')} fill="none" />
        ))}
        {actual?.points.map((p, i) => (
          <g key={i} tabIndex={0} role="button" aria-label={`${p.label}: ${p.y.toFixed(1)} ${unit}`} onFocus={() => setActive(p)} onMouseEnter={() => setActive(p)} onClick={() => setActive(p)} onBlur={() => setActive(null)}>
            <circle cx={sx(p.x)} cy={sy(p.y)} r={9} className="hit" />
            <circle cx={sx(p.x)} cy={sy(p.y)} r={active === p ? 4.5 : 3.2} className="dot" />
            <title>{`${p.label}: ${p.y.toFixed(1)} ${unit}`}</title>
          </g>
        ))}
      </svg>
      <ul className="legend">
        {series.map((s) => (
          <li key={s.name}>
            <svg width="22" height="8" aria-hidden="true">
              <line x1="0" x2="22" y1="4" y2="4" className={`line line-${s.kind}`} />
            </svg>
            {s.name}
          </li>
        ))}
      </ul>
    </figure>
  );
}
