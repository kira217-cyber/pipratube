import React, { useEffect, useRef, useState } from "react";

// Lightweight SVG charts for the creator pages — single series each (the
// card title names it, so no legend box), recessive grid, hover tooltip.

const useWidth = () => {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
};

const niceMax = (value) => {
  if (value <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  const nice = fraction <= 1.5 ? 1.5 : fraction <= 2 ? 2 : fraction <= 3 ? 3 : fraction <= 4 ? 4 : fraction <= 6 ? 6 : 10;
  return nice * exponent;
};

const Tooltip = ({ x, y, width, children }) => {
  const left = Math.min(Math.max(x, 60), width - 60);
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-line bg-[#0b0f15] px-2.5 py-1.5 text-xs shadow-xl"
      style={{ left, top: y - 8 }}
    >
      {children}
    </div>
  );
};

const PAD = { top: 12, right: 8, bottom: 26, left: 44 };

const Axes = ({ width, height, max, format, labels, xFor }) => {
  const ticks = [0, max / 3, (2 * max) / 3, max];
  const plotH = height - PAD.top - PAD.bottom;
  const every = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor((width - PAD.left) / 64))));

  return (
    <g>
      {ticks.map((tick) => {
        const y = PAD.top + plotH - (tick / max) * plotH;
        return (
          <g key={tick}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y} y2={y} stroke="rgba(255,255,255,0.07)" />
            <text x={PAD.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#9aa4b2">
              {format(tick)}
            </text>
          </g>
        );
      })}
      {labels.map((label, index) =>
        index % every === 0 ? (
          <text key={label + index} x={xFor(index)} y={height - 6} textAnchor="middle" fontSize="11" fill="#9aa4b2">
            {label}
          </text>
        ) : null,
      )}
    </g>
  );
};

export const BarChart = ({ data, color = "#22c55e", height = 200, format = (v) => v, valueFormat }) => {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  // At least 0-1-2-3 on the axis, so small counts never show repeated labels.
  const max = niceMax(Math.max(3, ...data.map((d) => d.value)));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const step = data.length ? plotW / data.length : 0;
  const barW = Math.max(2, Math.min(28, step - 2));
  const xFor = (index) => PAD.left + step * index + step / 2;

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Bar chart">
          <Axes width={width} height={height} max={max} format={format} labels={data.map((d) => d.label)} xFor={xFor} />
          {data.map((d, index) => {
            const h = (d.value / max) * plotH;
            const x = xFor(index) - barW / 2;
            const y = PAD.top + plotH - h;
            const r = Math.min(4, barW / 2, h);
            return (
              <g key={d.label + index} onMouseEnter={() => setHover(index)} onTouchStart={() => setHover(index)}>
                <rect x={xFor(index) - step / 2} y={PAD.top} width={step} height={plotH} fill="transparent" />
                <path
                  d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${y + h} Z`}
                  fill={color}
                  opacity={hover === null || hover === index ? 1 : 0.45}
                />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip x={xFor(hover)} y={PAD.top + plotH - (data[hover].value / max) * plotH} width={width}>
          <span className="text-muted">{data[hover].label}</span>{" "}
          <span className="font-semibold text-white">{(valueFormat || format)(data[hover].value)}</span>
        </Tooltip>
      )}
    </div>
  );
};

export const AreaChart = ({ data, color = "#2f86e6", height = 210, format = (v) => v, valueFormat }) => {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  // At least 0-1-2-3 on the axis, so small counts never show repeated labels.
  const max = niceMax(Math.max(3, ...data.map((d) => d.value)));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const xFor = (index) => PAD.left + (data.length > 1 ? (plotW * index) / (data.length - 1) : plotW / 2);
  const yFor = (value) => PAD.top + plotH - (value / max) * plotH;

  const line = data.map((d, i) => `${i ? "L" : "M"}${xFor(i)},${yFor(d.value)}`).join(" ");
  const area = data.length
    ? `${line} L${xFor(data.length - 1)},${PAD.top + plotH} L${xFor(0)},${PAD.top + plotH} Z`
    : "";

  const onMove = (clientX) => {
    const rect = ref.current.getBoundingClientRect();
    const ratio = (clientX - rect.left - PAD.left) / (plotW || 1);
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(ratio * (data.length - 1)))));
  };

  const gradientId = `area-${color.replace("#", "")}`;

  return (
    <div
      ref={ref}
      className="relative w-full touch-pan-y"
      onMouseMove={(event) => onMove(event.clientX)}
      onTouchMove={(event) => onMove(event.touches[0].clientX)}
      onMouseLeave={() => setHover(null)}
    >
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Line chart">
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <Axes width={width} height={height} max={max} format={format} labels={data.map((d) => d.label)} xFor={xFor} />
          <path d={area} fill={`url(#${gradientId})`} />
          <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
          {data.map((d, i) => (
            <circle key={i} cx={xFor(i)} cy={yFor(d.value)} r={hover === i ? 5 : 3.5} fill={color} stroke="#131a23" strokeWidth="2" />
          ))}
          {hover !== null && (
            <line x1={xFor(hover)} x2={xFor(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 3" />
          )}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip x={xFor(hover)} y={yFor(data[hover].value)} width={width}>
          <span className="text-muted">{data[hover].label}</span>{" "}
          <span className="font-semibold text-white">{(valueFormat || format)(data[hover].value)}</span>
        </Tooltip>
      )}
    </div>
  );
};

// Donut with a legend that carries the numbers — colour is never the
// only way to tell slices apart.
export const DonutChart = ({ data, size = 128, thickness = 26 }) => {
  const [hover, setHover] = useState(null);
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = 2;
  // Where each slice starts along the ring.
  const starts = data.reduce(
    (acc, d) => [...acc, acc[acc.length - 1] + (d.value / total) * circumference],
    [0],
  );

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90" role="img" aria-label="Donut chart">
        {data.map((d, index) => {
          const length = (d.value / total) * circumference;
          const dash = Math.max(0, length - gap);
          const segment = (
            <circle
              key={d.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={d.color}
              strokeWidth={hover === index ? thickness + 4 : thickness}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-starts[index]}
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
              className="cursor-default transition-[stroke-width]"
            />
          );
          return segment;
        })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 text-xs sm:text-sm">
        {data.map((d, index) => (
          <li
            key={d.label}
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
            className={`flex items-center gap-2 ${hover !== null && hover !== index ? "opacity-50" : ""}`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="min-w-0 flex-1 truncate text-slate-300">{d.label}</span>
            <span className="font-semibold text-white">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

// Ring showing a single share (e.g. 68% male).
export const RingStat = ({ value, color, label, size = 84 }) => {
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(value / 100) * circumference} ${circumference}`}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-lg font-bold">{value}%</span>
      </div>
      <span className="text-sm text-slate-300">{label}</span>
    </div>
  );
};

// Decorative mini bar trend inside a stat tile (the tile's number is the
// real content, so this is hidden from screen readers).
export const Sparkbars = ({ values, color, className = "" }) => {
  const max = Math.max(...values, 1);
  return (
    <div aria-hidden="true" className={`flex h-9 items-end gap-[2px] ${className}`}>
      {values.map((value, index) => (
        <span
          key={index}
          className="w-[4px] rounded-t-sm"
          style={{ height: `${Math.max(8, (value / max) * 100)}%`, background: color, opacity: 0.45 + (index / values.length) * 0.55 }}
        />
      ))}
    </div>
  );
};
