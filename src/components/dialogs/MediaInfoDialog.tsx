import type { MediaInfo, PlayPlan } from '../../../shared/media';
import { formatTime } from '../../lib/format';
import { Dialog } from '../ui';

const mb = (b?: number) => (b ? `${(b / 1024 / 1024).toFixed(b > 1e9 ? 0 : 1)} MB` : '—');
const kbps = (b?: number) => (b ? `${Math.round(b / 1000).toLocaleString()} kb/s` : '—');

export function MediaInfoDialog({ info, plan, onClose }: { info: MediaInfo; plan: PlayPlan | null; onClose: () => void }) {
  const v = info.video;
  const rows: [string, string][] = [
    ['File', info.input],
    ['Container', info.formatLongName || info.formatName],
    ['Duration', formatTime(info.duration)],
    ['Size', mb(info.size)],
    ['Bitrate', kbps(info.bitRate)],
    ['Playback', plan ? `${plan.mode[0].toUpperCase()}${plan.mode.slice(1)} — ${plan.reason}${plan.videoEncoder ? ` (${plan.videoEncoder})` : ''}` : '—'],
  ];
  return (
    <Dialog title="Media Info" width={520} onClose={onClose}>
      <dl className="info">
        {rows.map(([k, val]) => (
          <div key={k} className="info__row">
            <dt>{k}</dt>
            <dd dir="auto">{val}</dd>
          </div>
        ))}
      </dl>
      {v && (
        <>
          <div className="section-title">Video</div>
          <dl className="info">
            <div className="info__row"><dt>Codec</dt><dd>{v.codec.toUpperCase()}{v.profile ? ` (${v.profile})` : ''}</dd></div>
            <div className="info__row"><dt>Resolution</dt><dd>{v.width} × {v.height}</dd></div>
            <div className="info__row"><dt>Frame rate</dt><dd>{v.fps ? `${v.fps.toFixed(3).replace(/\.?0+$/, '')} fps` : '—'}</dd></div>
            <div className="info__row"><dt>Color</dt><dd>{v.pixFmt ?? '—'} · {v.bitDepth}-bit{v.hdr ? ' · HDR' : ''}</dd></div>
            <div className="info__row"><dt>Bitrate</dt><dd>{kbps(v.bitRate)}</dd></div>
          </dl>
        </>
      )}
      {info.audio.length > 0 && (
        <>
          <div className="section-title">Audio</div>
          <dl className="info">
            {info.audio.map((a) => (
              <div key={a.index} className="info__row">
                <dt>Track {a.index + 1}</dt>
                <dd dir="auto">{[a.codec.toUpperCase(), `${a.channels} ch`, a.language, a.title].filter(Boolean).join(' · ')}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {info.subtitles.length > 0 && (
        <>
          <div className="section-title">Subtitles</div>
          <dl className="info">
            {info.subtitles.map((s) => (
              <div key={s.index} className="info__row">
                <dt>Track {s.index + 1}</dt>
                <dd dir="auto">{[s.codec.toUpperCase(), s.language, s.title, s.forced && 'forced'].filter(Boolean).join(' · ')}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {info.chapters.length > 0 && (
        <>
          <div className="section-title">Chapters</div>
          <dl className="info">
            {info.chapters.map((c, i) => (
              <div key={i} className="info__row">
                <dt>{formatTime(c.start)}</dt>
                <dd dir="auto">{c.title}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </Dialog>
  );
}
