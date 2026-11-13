import { availableFonts } from '../../lib/fonts';
import { DEFAULT_SUB_STYLE, type SubtitleStyle } from '../../lib/settings';
import { Button, Dialog, Range, Row, Select, Stepper, Toggle } from '../ui';

type Props = {
  style: SubtitleStyle;
  secondaryStyle: SubtitleStyle;
  delay: number;
  hasSecondary: boolean;
  onStyle: (s: SubtitleStyle) => void;
  onSecondaryStyle: (s: SubtitleStyle) => void;
  onDelay: (d: number) => void;
  onClose: () => void;
};

const signed = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} s`;

function StyleFields({ style, onChange }: { style: SubtitleStyle; onChange: (s: SubtitleStyle) => void }) {
  const set = (p: Partial<SubtitleStyle>) => onChange({ ...style, ...p });
  return (
    <>
      <div className="field-label">Font</div>
      <div className="font-grid" role="radiogroup" aria-label="Font">
        {availableFonts().map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={style.font === f.id}
            className={`font-option ${style.font === f.id ? 'is-on' : ''}`}
            style={{ fontFamily: f.family }}
            onClick={() => set({ font: f.id })}
          >
            <span className="font-option__sample">زیرنویس</span>
            <span className="font-option__name">
              {f.name}
              {f.id === DEFAULT_SUB_STYLE.font && <span className="font-option__default"> · پیش‌فرض</span>}
            </span>
          </button>
        ))}
      </div>
      <Row label="Size">
        <Range value={style.size} min={20} max={96} step={1} onChange={(size) => set({ size })} format={(v) => `${v}`} />
      </Row>
      <Row label="Color">
        <input className="color" type="color" value={style.color} onChange={(e) => set({ color: e.target.value })} />
      </Row>
      <Row label="Secondary color" hint="Parts the subtitle file colors, like translator credits or a site address">
        <Select
          value={style.secondaryColorMode}
          options={[
            { value: 'file', label: 'From file' },
            { value: 'custom', label: 'Custom' },
          ]}
          onChange={(secondaryColorMode) => set({ secondaryColorMode })}
        />
        <input
          className="color"
          type="color"
          value={style.secondaryColor}
          title="Pick a color (switches to Custom)"
          onChange={(e) => set({ secondaryColor: e.target.value, secondaryColorMode: 'custom' })}
        />
      </Row>
      <Row label="Outline">
        <input className="color" type="color" value={style.outlineColor} onChange={(e) => set({ outlineColor: e.target.value })} />
        <Range value={style.outline} min={0} max={6} step={0.5} onChange={(outline) => set({ outline })} format={(v) => `${v}px`} />
      </Row>
      <Row label="Background">
        <Select
          value={style.background}
          options={[
            { value: 'none', label: 'None' },
            { value: 'box', label: 'Dark box' },
          ]}
          onChange={(background) => set({ background })}
        />
      </Row>
      <Row label="Bold" hint={style.font === 'peyda' ? 'Peyda only comes in bold' : undefined}>
        <Toggle checked={style.bold} onChange={(bold) => set({ bold })} />
      </Row>
      <Row label="Position" hint="Distance from the bottom">
        <Range value={style.position} min={0} max={90} step={1} onChange={(position) => set({ position })} format={(v) => `${v}%`} />
      </Row>
    </>
  );
}

export function SubtitleSettingsDialog(p: Props) {
  return (
    <Dialog
      title="Subtitle Settings"
      modal={false}
      width={380}
      onClose={p.onClose}
      footer={
        <Button
          variant="ghost"
          onClick={() => {
            p.onStyle(DEFAULT_SUB_STYLE);
            p.onDelay(0);
          }}
        >
          Reset
        </Button>
      }
    >
      <div className="section-title">Timing</div>
      <Row label="Delay" hint="G / H to adjust while playing">
        <Stepper value={p.delay} step={0.1} onChange={p.onDelay} format={signed} />
      </Row>
      {p.hasSecondary && <div className="section-title">Primary subtitle</div>}
      <StyleFields style={p.style} onChange={p.onStyle} />
      {p.hasSecondary && (
        <>
          <div className="section-title">Secondary subtitle</div>
          <StyleFields style={p.secondaryStyle} onChange={p.onSecondaryStyle} />
        </>
      )}
    </Dialog>
  );
}
