import type { CSSProperties } from 'react';
import { fontFamily } from '../lib/fonts';
import type { SubtitleStyle } from '../lib/settings';
import type { Cue } from '../lib/subtitles';

type Props = { cues: Cue[]; style: SubtitleStyle; stageHeight: number; secondary?: boolean };

/** Sizes are authored for a 1080 px tall picture and scale with the stage. */
export function SubtitleOverlay({ cues, style, stageHeight, secondary }: Props) {
  if (!cues.length) return null;
  const scale = Math.max(0.45, stageHeight / 1080);
  const o = style.outline * scale;
  const shadow =
    o > 0
      ? [`${o}px 0`, `-${o}px 0`, `0 ${o}px`, `0 -${o}px`, `${o * 0.7}px ${o * 0.7}px`, `-${o * 0.7}px -${o * 0.7}px`, `${o * 0.7}px -${o * 0.7}px`, `-${o * 0.7}px ${o * 0.7}px`]
          .map((p) => `${p} 0 ${style.outlineColor}`)
          .join(',') + `, 0 ${2 * scale}px ${6 * scale}px rgba(0,0,0,.55)`
      : `0 ${2 * scale}px ${6 * scale}px rgba(0,0,0,.7)`;

  const css: CSSProperties = {
    fontFamily: fontFamily(style.font),
    fontSize: style.size * scale,
    fontWeight: style.bold ? 600 : 400,
    color: style.color,
    textShadow: style.background === 'box' ? 'none' : shadow,
  };

  const bottom = cues.filter((c) => !c.top);
  const top = cues.filter((c) => c.top);
  const render = (list: Cue[]) =>
    list.map((c, i) => (
      <p key={`${c.start}-${i}`} className={`subtitles__cue ${style.background === 'box' ? 'subtitles__cue--box' : ''}`} dir="auto" style={css}>
        {c.parts
          ? c.parts.map((part, j) => (
              <span
                key={j}
                style={{
                  color: part.color ? (style.secondaryColorMode === 'custom' ? style.secondaryColor : part.color) : undefined,
                  fontStyle: part.italic ? 'italic' : undefined,
                }}
              >
                {part.text}
              </span>
            ))
          : c.text}
      </p>
    ));

  return (
    <>
      {bottom.length > 0 && (
        <div className={`subtitles ${secondary ? 'subtitles--secondary' : ''}`} style={{ bottom: `${style.position}%` }}>
          {render(bottom)}
        </div>
      )}
      {top.length > 0 && (
        <div className="subtitles subtitles--top" style={{ top: '6%' }}>
          {render(top)}
        </div>
      )}
    </>
  );
}
