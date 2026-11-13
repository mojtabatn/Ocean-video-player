import { Button, Dialog, Range, Row } from '../ui';

export type VideoAdjust = { brightness: number; contrast: number; saturation: number; hue: number };
export const DEFAULT_ADJUST: VideoAdjust = { brightness: 100, contrast: 100, saturation: 100, hue: 0 };

export function VideoAdjustDialog({ value, onChange, onClose }: { value: VideoAdjust; onChange: (v: VideoAdjust) => void; onClose: () => void }) {
  const set = (p: Partial<VideoAdjust>) => onChange({ ...value, ...p });
  return (
    <Dialog
      title="Video Adjustments"
      modal={false}
      width={360}
      onClose={onClose}
      footer={<Button variant="ghost" onClick={() => onChange(DEFAULT_ADJUST)}>Reset</Button>}
    >
      <Row label="Brightness">
        <Range value={value.brightness} min={30} max={200} step={1} onChange={(brightness) => set({ brightness })} format={(v) => `${v}%`} />
      </Row>
      <Row label="Contrast">
        <Range value={value.contrast} min={30} max={200} step={1} onChange={(contrast) => set({ contrast })} format={(v) => `${v}%`} />
      </Row>
      <Row label="Saturation">
        <Range value={value.saturation} min={0} max={250} step={1} onChange={(saturation) => set({ saturation })} format={(v) => `${v}%`} />
      </Row>
      <Row label="Hue">
        <Range value={value.hue} min={-180} max={180} step={1} onChange={(hue) => set({ hue })} format={(v) => `${v}°`} />
      </Row>
    </Dialog>
  );
}
