import { useCallback, useRef, useState } from 'react';

type Props = {
  value: number;
  max: number;
  onChange: (value: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  /** Buffered position, drawn behind the fill. */
  buffered?: number;
  thumb?: 'always' | 'hover';
  className?: string;
  label: string;
  /** Hover position (value under the pointer) for previews; null when the pointer leaves. */
  onHover?: (value: number | null, x: number) => void;
  /** Tick marks (e.g. chapters), in value units. */
  markers?: number[];
};

/** Thin rail + 4px blue fill + 16px thumb, as in the Figma control bar. */
export function Slider({ value, max, onChange, onScrubStart, onScrubEnd, buffered, thumb = 'always', className, label, onHover, markers }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const bufferedRatio = buffered && max > 0 ? Math.min(1, buffered / max) : 0;

  const valueAt = useCallback(
    (clientX: number) => {
      const r = ref.current!.getBoundingClientRect();
      return Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * max;
    },
    [max],
  );

  return (
    <div
      ref={ref}
      className={`slider ${thumb === 'hover' ? 'slider--thumb-hover' : ''} ${scrubbing ? 'is-scrubbing' : ''} ${className ?? ''}`}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={-1}
      onPointerDown={(e) => {
        if (e.button !== 0 || max <= 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setScrubbing(true);
        onScrubStart?.();
        onChange(valueAt(e.clientX));
      }}
      onPointerMove={(e) => {
        if (scrubbing) onChange(valueAt(e.clientX));
        if (onHover && max > 0) onHover(valueAt(e.clientX), e.clientX - ref.current!.getBoundingClientRect().left);
      }}
      onPointerLeave={() => onHover?.(null, 0)}
      onPointerUp={(e) => {
        if (!scrubbing) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        setScrubbing(false);
        onScrubEnd?.();
      }}
      onWheel={(e) => {
        if (max <= 0) return;
        onChange(Math.min(max, Math.max(0, value - Math.sign(e.deltaY) * max * 0.05)));
      }}
    >
      <div className="slider__rail" />
      {bufferedRatio > 0 && <div className="slider__buffered" style={{ width: `${bufferedRatio * 100}%` }} />}
      <div className="slider__fill" style={{ width: `${ratio * 100}%` }} />
      {max > 0 &&
        markers?.map((m) => <div key={m} className="slider__marker" style={{ left: `${(m / max) * 100}%` }} />)}
      <div className="slider__thumb" style={{ left: `${ratio * 100}%` }} />
    </div>
  );
}
