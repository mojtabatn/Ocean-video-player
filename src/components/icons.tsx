// Placeholder icons drawn to match the Figma mockup. Swap for the exported SVGs when they arrive.
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

export const MenuIcon = (p: P) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" {...p}>
    <rect x="1.1" y="1.6" width="11.8" height="10.8" rx="2" />
    <path d="M4 5.6h6M4 8.4h6" strokeLinecap="round" />
  </svg>
);

export const MinimizeIcon = (p: P) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" {...p}>
    <path d="M0 5.5h10" />
  </svg>
);

export const MaximizeIcon = (p: P) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" {...p}>
    <rect x=".5" y=".5" width="9" height="9" rx="1" />
  </svg>
);

export const RestoreIcon = (p: P) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" {...p}>
    <rect x=".5" y="2.5" width="7" height="7" rx="1" />
    <path d="M2.5 2.5V1.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1" />
  </svg>
);

export const CloseIcon = (p: P) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeLinecap="round" {...p}>
    <path d="M.5.5l9 9M9.5.5l-9 9" />
  </svg>
);

export const PrevIcon = (p: P) => (
  <svg width="17" height="16" viewBox="0 0 17 16" fill="currentColor" {...p}>
    <rect x=".5" y="1" width="2.4" height="14" rx="1" />
    <path d="M15.4 1.6c0-.8-.9-1.3-1.6-.8L5 7.2a1 1 0 0 0 0 1.6l8.8 6.4c.7.5 1.6 0 1.6-.8V1.6Z" />
  </svg>
);

export const NextIcon = (p: P) => (
  <svg width="17" height="16" viewBox="0 0 17 16" fill="currentColor" {...p}>
    <rect x="14.1" y="1" width="2.4" height="14" rx="1" />
    <path d="M1.6 1.6c0-.8.9-1.3 1.6-.8L12 7.2a1 1 0 0 1 0 1.6l-8.8 6.4c-.7.5-1.6 0-1.6-.8V1.6Z" />
  </svg>
);

export const PlayIcon = (p: P) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" {...p}>
    <path d="M3 1.9c0-.85.93-1.37 1.65-.92l9.6 6.1c.66.42.66 1.4 0 1.82l-9.6 6.1c-.72.46-1.65-.06-1.65-.92V1.9Z" />
  </svg>
);

export const PauseIcon = (p: P) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" {...p}>
    <rect x="1.5" y="0" width="5" height="16" rx="1.2" />
    <rect x="9.5" y="0" width="5" height="16" rx="1.2" />
  </svg>
);

export const CaptionsIcon = ({ active = true, ...p }: P & { active?: boolean }) => (
  <svg width="21" height="20" viewBox="0 0 21 20" fill="none" {...p}>
    <rect x=".5" y="1" width="15" height="12" rx="1.5" fill={active ? '#0466C8' : '#5A5A5A'} />
    <rect x="5" y="6" width="15.5" height="13" rx="1.5" fill="#fff" />
    <text
      x="12.75"
      y="15.6"
      textAnchor="middle"
      fontFamily="Manrope Variable, sans-serif"
      fontWeight="800"
      fontSize="7.2"
      fill={active ? '#0466C8' : '#5A5A5A'}
    >
      CC
    </text>
  </svg>
);

export const VolumeIcon = ({ level = 1, muted = false, ...p }: P & { level?: number; muted?: boolean }) => (
  <svg width="21" height="21" viewBox="0 0 20 20" fill="none" {...p}>
    <path
      d="M1 7.2c0-.66.54-1.2 1.2-1.2h2.6L9.3 2.2c.65-.55 1.65-.09 1.65.76v14.08c0 .85-1 1.31-1.65.76L4.8 14H2.2c-.66 0-1.2-.54-1.2-1.2V7.2Z"
      fill="currentColor"
    />
    {muted ? (
      <path d="M14 7.5l5 5M19 7.5l-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    ) : (
      <>
        {level > 0 && (
          <path d="M13.6 7.4a3.8 3.8 0 0 1 0 5.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        )}
        {level > 0.5 && (
          <path d="M16.2 5a7.2 7.2 0 0 1 0 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        )}
      </>
    )}
  </svg>
);

export const OpenFileIcon = (p: P) => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}>
    <path d="M9 6.5h14l8 8v19a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-25a2 2 0 0 1 2-2Z" strokeLinejoin="round" />
    <path d="M23 6.5v8h8" strokeLinejoin="round" />
    <path d="M17 19.5v9l7-4.5-7-4.5Z" fill="currentColor" strokeLinejoin="round" />
  </svg>
);

/** "Open New File" icon from the menu design (12 × 12). */
export const OpenFileSmallIcon = (p: P) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" {...p}>
    <path d="M2.5 1.5a1 1 0 0 1 1-1h4l2.5 2.5v7.5a1 1 0 0 1-1 1h-5.5a1 1 0 0 1-1-1v-9Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    <path d="M7.5.5V3H10" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    <path d="M5 5.6v3.3l2.7-1.65L5 5.6Z" fill="currentColor" />
  </svg>
);
