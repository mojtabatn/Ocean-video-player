import logo from '../assets/logo.svg';
import { ocean } from '../lib/bridge';
import { CloseIcon, ExitFullscreenIcon, FullscreenIcon, HomeGlyph, MaximizeIcon, MenuGlyph, MinimizeIcon, RestoreIcon } from './titleIcons';

type Props = {
  title: string;
  maximized: boolean;
  fullscreen: boolean;
  menuOpen: boolean;
  canGoHome: boolean;
  onMenuClick: (e: React.MouseEvent) => void;
  onHome: () => void;
  onToggleFullscreen: () => void;
};

/**
 * Ocean's own title bar (Figma "App Preview"): brand, | , menu, back to the first view — title — minimize,
 * maximize/restore, fullscreen (hides this bar and the progress bar; it reappears while the mouse moves) and close.
 */
export function TitleBar({ title, maximized, fullscreen, menuOpen, canGoHome, onMenuClick, onHome, onToggleFullscreen }: Props) {
  return (
    <header className={`titlebar ${fullscreen ? 'titlebar--overlay' : ''}`} onDoubleClick={() => !fullscreen && ocean?.toggleMaximize()}>
      <div className="titlebar__brand">
        <img className="titlebar__logo" src={logo} width={13} height={14} alt="" draggable={false} />
        <span className="titlebar__name">OCEAN</span>
        <span className="titlebar__sep" aria-hidden />
        <button
          className={`tb ${menuOpen ? 'is-active' : ''}`}
          aria-label="Menu"
          title="Menu"
          aria-expanded={menuOpen}
          onClick={onMenuClick}
          onMouseDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <MenuGlyph />
        </button>
        <button className="tb" aria-label="Back to start" title="Back to start" disabled={!canGoHome} onClick={onHome} onDoubleClick={(e) => e.stopPropagation()}>
          <HomeGlyph />
        </button>
      </div>

      <div className="titlebar__title" title={title}>
        {title}
      </div>

      <div className="titlebar__controls" onDoubleClick={(e) => e.stopPropagation()}>
        <button className="wc" aria-label="Minimize" title="Minimize" onClick={() => ocean?.minimize()}>
          <MinimizeIcon />
        </button>
        <button className="wc" aria-label={maximized ? 'Restore' : 'Maximize'} title={maximized ? 'Restore' : 'Maximize'} onClick={() => ocean?.toggleMaximize()}>
          {maximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button
          className="wc"
          aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen — hides the top bar and progress bar (F)'}
          onClick={onToggleFullscreen}
        >
          {fullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
        </button>
        <button className="wc wc--close" aria-label="Close" title="Close" onClick={() => (ocean ? ocean.close() : window.close())}>
          <CloseIcon />
        </button>
      </div>
    </header>
  );
}
