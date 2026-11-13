import { EQ_BANDS, EQ_PRESETS } from '../../player/audioGraph';
import { Button, Dialog, Row, Select, Stepper, Toggle } from '../ui';

type Props = {
  enabled: boolean;
  gains: number[];
  preset: string;
  normalize: boolean;
  audioDelay: number;
  onEnabled: (v: boolean) => void;
  onGains: (g: number[], preset: string) => void;
  onNormalize: (v: boolean) => void;
  onAudioDelay: (v: number) => void;
  onClose: () => void;
};

const label = (f: number) => (f >= 1000 ? `${f / 1000}k` : `${f}`);

export function EqualizerDialog(p: Props) {
  return (
    <Dialog
      title="Audio Effects"
      modal={false}
      width={440}
      onClose={p.onClose}
      footer={<Button variant="ghost" onClick={() => p.onGains(EQ_PRESETS.Flat, 'Flat')}>Reset EQ</Button>}
    >
      <div className="section-title">Sync</div>
      <Row label="Audio delay" hint="Ctrl + / Ctrl − while playing">
        <Stepper value={p.audioDelay} step={0.1} onChange={p.onAudioDelay} format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} s`} />
      </Row>
      <Row label="Normalize volume" hint="Evens out quiet dialogue and loud scenes">
        <Toggle checked={p.normalize} onChange={p.onNormalize} />
      </Row>
      <div className="section-title">Equalizer</div>
      <Row label="Enabled">
        <Toggle checked={p.enabled} onChange={p.onEnabled} />
        <Select
          value={EQ_PRESETS[p.preset] ? p.preset : 'Custom'}
          options={[...Object.keys(EQ_PRESETS), ...(EQ_PRESETS[p.preset] ? [] : ['Custom'])].map((k) => ({ value: k, label: k }))}
          onChange={(name) => EQ_PRESETS[name] && p.onGains(EQ_PRESETS[name], name)}
        />
      </Row>
      <div className={`eq ${p.enabled ? '' : 'is-off'}`}>
        {EQ_BANDS.map((f, i) => (
          <div key={f} className="eq__band">
            <span className="eq__db">{p.gains[i] > 0 ? '+' : ''}{p.gains[i]}</span>
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={p.gains[i]}
              aria-label={`${label(f)} Hz`}
              onChange={(e) => {
                const g = [...p.gains];
                g[i] = Number(e.target.value);
                p.onGains(g, 'Custom');
              }}
            />
            <span className="eq__freq">{label(f)}</span>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
