'use client';

import { useMemo, useState } from 'react';

/**
 * Hand-rolled SVG charts.
 *
 * Deliberately dependency-free: no charting library, no CDN, nothing that
 * breaks inside a sandboxed preview or adds 200 kB to the bundle. Each chart is
 * responsive via viewBox and exposes accessible text summaries.
 */

export interface SeriesPoint {
  label: string;
  value: number;
  secondary?: number;
}

const NICE_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

function niceMax(value: number, ticks = 4): number {
  if (value <= 0) return ticks;
  const rough = value / ticks;
  const step = NICE_STEPS.find((s) => s >= rough) ?? Math.ceil(rough / 1000) * 1000;
  return step * ticks;
}

// ----------------------------------------------------------------- Bar chart
export function BarChart({
  data,
  height = 200,
  color = '#4f46e5',
  valueLabel = '',
  horizontal = false,
}: {
  data: SeriesPoint[];
  height?: number;
  color?: string;
  valueLabel?: string;
  horizontal?: boolean;
}) {
  const max = useMemo(() => niceMax(Math.max(...data.map((d) => d.value), 1)), [data]);

  if (!data.length) return <p className="px-4 py-8 text-center text-sm text-ink-400">No data for this period</p>;

  if (horizontal) {
    return (
      <ul className="space-y-2.5">
        {data.map((point) => (
          <li key={point.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate font-medium text-ink-700">{point.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-ink-900">
                {point.value.toLocaleString('en-IN')}
                {valueLabel ? <span className="ml-1 font-normal text-ink-400">{valueLabel}</span> : null}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink-100">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${(point.value / max) * 100}%`, background: color }}
              />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="w-full" style={{ height }}>
      <svg viewBox={`0 0 320 ${height}`} preserveAspectRatio="none" className="h-full w-full" role="img" aria-label={`Bar chart: ${valueLabel}`}>
        {[0, 1, 2, 3, 4].map((i) => {
          const y = (height / 4) * i;
          return <line key={i} x1="0" y1={y} x2="320" y2={y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray={i === 4 ? '0' : '3 3'} />;
        })}
        {data.map((point, index) => {
          const slot = 320 / data.length;
          const barWidth = Math.min(38, slot * 0.58);
          const barHeight = (point.value / max) * (height - 24);
          return (
            <g key={point.label}>
              <rect
                x={slot * index + (slot - barWidth) / 2}
                y={height - 24 - barHeight}
                width={barWidth}
                height={Math.max(2, barHeight)}
                rx="4"
                fill={color}
                opacity={0.9}
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between gap-1 text-[10px] font-medium text-ink-400">
        {data.map((point) => (
          <span key={point.label} className="flex-1 truncate text-center">
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- Area/line
export function AreaChart({
  data,
  height = 220,
  color = '#4f46e5',
  secondaryColor = '#14b8a6',
  primaryLabel = 'Offers',
  secondaryLabel,
}: {
  data: SeriesPoint[];
  height?: number;
  color?: string;
  secondaryColor?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const padding = { top: 16, right: 12, bottom: 28, left: 30 };

  const max = Math.max(...data.map((d) => Math.max(d.value, d.secondary ?? 0)), 1);
  const niceY = niceMax(max, 4);

  if (!data.length) return <p className="px-4 py-8 text-center text-sm text-ink-400">No trend data yet</p>;

  const x = (i: number) => padding.left + (i * (width - padding.left - padding.right)) / Math.max(1, data.length - 1);
  const y = (v: number) => padding.top + (1 - v / niceY) * (height - padding.top - padding.bottom);

  const line = (key: 'value' | 'secondary') =>
    data
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y((d[key] ?? 0) as number).toFixed(1)}`)
      .join(' ');

  const area = `${line('value')} L ${x(data.length - 1).toFixed(1)} ${height - padding.bottom} L ${padding.left} ${height - padding.bottom} Z`;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${primaryLabel} trend across ${data.length} months`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3, 4].map((i) => {
          const value = (niceY / 4) * (4 - i);
          const yy = padding.top + ((height - padding.top - padding.bottom) / 4) * i;
          return (
            <g key={i}>
              <line x1={padding.left} y1={yy} x2={width - padding.right} y2={yy} stroke="#e2e8f0" strokeDasharray={i === 4 ? '0' : '3 3'} />
              <text x={padding.left - 6} y={yy + 3} textAnchor="end" fontSize="9" fill="#94a3b8">
                {Math.round(value)}
              </text>
            </g>
          );
        })}

        <path d={area} fill="url(#areaFill)" />
        <path d={line('value')} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {data.some((d) => d.secondary !== undefined) ? (
          <path d={line('secondary')} fill="none" stroke={secondaryColor} strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" />
        ) : null}

        {data.map((point, i) => (
          <g key={point.label}>
            <circle cx={x(i)} cy={y(point.value)} r={hover === i ? 5 : 3} fill="#fff" stroke={color} strokeWidth="2.5" />
            <text x={x(i)} y={height - 10} textAnchor="middle" fontSize="9" fill="#94a3b8">
              {point.label}
            </text>
            {/* Invisible hover target — easier to hit than the 3px dot. */}
            <rect
              x={x(i) - 18}
              y={padding.top}
              width="36"
              height={height - padding.top - padding.bottom}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          </g>
        ))}

        {hover !== null ? (
          <g>
            <line
              x1={x(hover)}
              y1={padding.top}
              x2={x(hover)}
              y2={height - padding.bottom}
              stroke={color}
              strokeOpacity="0.3"
              strokeWidth="1.5"
            />
          </g>
        ) : null}
      </svg>

      <div className="mt-1 flex items-center justify-center gap-4 text-xs text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          {primaryLabel}
        </span>
        {secondaryLabel ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: secondaryColor }} />
            {secondaryLabel}
          </span>
        ) : null}
        {hover !== null ? (
          <span className="font-semibold text-ink-700">
            {data[hover].label}: {data[hover].value}
            {data[hover].secondary !== undefined ? ` · ${data[hover].secondary}` : ''}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- Donut
export function DonutChart({
  data,
  size = 180,
  thickness = 22,
  centerLabel,
  centerValue,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const segments = data.map((segment) => {
    const fraction = total ? segment.value / total : 0;
    const dash = fraction * circumference;
    const segmentOffset = offset;
    offset += dash;
    return { ...segment, dash, offset: segmentOffset, fraction };
  });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0" role="img" aria-label="Distribution chart">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={thickness} />
        {segments.map((segment) => (
          <circle
            key={segment.label}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={segment.color}
            strokeWidth={thickness}
            strokeDasharray={`${segment.dash} ${circumference - segment.dash}`}
            strokeDashoffset={-segment.offset}
            strokeLinecap="butt"
            className="transition-all duration-700"
          />
        ))}
      </svg>

      <div className="w-full">
        {centerValue ? (
          <div className="mb-3">
            <p className="text-2xl font-bold tabular-nums text-ink-900">{centerValue}</p>
            <p className="text-xs font-medium text-ink-500">{centerLabel}</p>
          </div>
        ) : null}
        <ul className="space-y-1.5">
          {segments.map((segment) => (
            <li key={segment.label} className="flex items-center justify-between gap-3 text-xs">
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: segment.color }} />
                <span className="truncate font-medium text-ink-700">{segment.label}</span>
              </span>
              <span className="shrink-0 tabular-nums text-ink-500">
                <span className="font-semibold text-ink-900">{segment.value}</span>
                {total ? <span className="ml-1">({Math.round(segment.fraction * 100)}%)</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- Funnel
export function FunnelChart({ data }: { data: { status: string; count: number; label?: string }[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const max = Math.max(...data.map((d) => d.count), 1);
  const top = data[0]?.count || 1;

  return (
    <ul className="space-y-2">
      {data.map((stage, index) => {
        const width = Math.max(6, (stage.count / max) * 100);
        const conversion = top ? (stage.count / top) * 100 : 0;
        const hue = 245 - index * 16;

        return (
          <li
            key={stage.status}
            onMouseEnter={() => setHovered(stage.status)}
            onMouseLeave={() => setHovered(null)}
            className="group"
          >
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="text-xs font-semibold text-ink-700">{stage.label ?? stage.status.replace(/_/g, ' ').toLowerCase()}</span>
              <span className="text-xs tabular-nums text-ink-500">
                <span className="font-bold text-ink-900">{stage.count}</span>
                {index > 0 ? <span className="ml-1.5 text-ink-400">{conversion.toFixed(0)}% of applied</span> : null}
              </span>
            </div>
            <div className="h-7 overflow-hidden rounded-md bg-ink-50">
              <div
                className="flex h-full items-center rounded-md px-2 text-[11px] font-semibold text-white transition-all duration-700"
                style={{
                  width: `${width}%`,
                  background: `linear-gradient(90deg, hsl(${hue} 70% 58%), hsl(${hue + 12} 72% 48%))`,
                  opacity: hovered === null || hovered === stage.status ? 1 : 0.55,
                }}
              >
                {width > 18 ? stage.count : ''}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ----------------------------------------------------------------- Sparkline
export function Sparkline({ values, color = '#4f46e5', height = 32 }: { values: number[]; color?: string; height?: number }) {
  if (values.length < 2) return <div style={{ height }} />;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const width = 120;

  const path = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * width) / (values.length - 1)} ${height - ((v - min) / range) * (height - 4) - 2}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-full" preserveAspectRatio="none" aria-hidden="true">
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ----------------------------------------------------------------- Heat bar
/** Compact label+bar row used in breakdown lists (attendance, ctc bands…). */
export function BreakdownBars({
  data,
  colorFor,
  suffix = '',
}: {
  data: { label: string; value: number }[];
  colorFor?: (value: number, index: number) => string;
  suffix?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className="space-y-2">
      {data.map((item, index) => (
        <li key={item.label} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-xs font-medium text-ink-600">{item.label}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-100">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${(item.value / max) * 100}%`, background: colorFor?.(item.value, index) ?? '#4f46e5' }}
            />
          </div>
          <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums text-ink-800">
            {item.value.toLocaleString('en-IN')}
            {suffix}
          </span>
        </li>
      ))}
    </ul>
  );
}
