import logo from '../../assets/logo.svg';
import { Dialog } from '../ui';

export function HelpDialog({ onClose, onShortcuts }: { onClose: () => void; onShortcuts: () => void }) {
  return (
    <Dialog title="Help" width={440} onClose={onClose}>
      <div className="about">
        <img src={logo} width={37} height={40} alt="" />
        <div>
          <div className="about__name">Ocean Player</div>
          <div className="about__version">Version 0.1.0</div>
        </div>
      </div>
      <div className="section-title">Getting started</div>
      <ul className="help-list">
        <li>Open a video with <kbd>Ctrl</kbd> <kbd>O</kbd>, drag it onto the window, or pick something from the home screen.</li>
        <li>Drop a subtitle file (SRT, VTT, ASS, SUB, SMI) onto the player to load it.</li>
        <li>Right-click the video for the full menu.</li>
        <li>Double-click the video for fullscreen; scroll over it to change the volume.</li>
        <li>MKV, AVI, HEVC, AC3/DTS and other formats are converted on the fly with FFmpeg.</li>
      </ul>
      <div className="section-title">More</div>
      <button className="link" onClick={onShortcuts}>View all keyboard shortcuts</button>
    </Dialog>
  );
}
