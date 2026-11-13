// Window-control icons from the Figma "top bar actions" frame (paths unchanged; white → currentColor).
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

export const MinimizeIcon = (p: P) => (
  <svg width="10" height="10" viewBox="16 17 10 10" fill="none" {...p}>
    <path d="M16.498 22C16.4297 22 16.3646 21.987 16.3027 21.9609C16.2441 21.9349 16.1921 21.8991 16.1465 21.8535C16.1009 21.8079 16.0651 21.7559 16.0391 21.6973C16.013 21.6354 16 21.5703 16 21.502C16 21.4336 16.013 21.3701 16.0391 21.3115C16.0651 21.2497 16.1009 21.196 16.1465 21.1504C16.1921 21.1016 16.2441 21.0641 16.3027 21.0381C16.3646 21.012 16.4297 20.999 16.498 20.999H25.502C25.5703 20.999 25.6338 21.012 25.6924 21.0381C25.7542 21.0641 25.8079 21.1016 25.8535 21.1504C25.8991 21.196 25.9349 21.2497 25.9609 21.3115C25.987 21.3701 26 21.4336 26 21.502C26 21.5703 25.987 21.6354 25.9609 21.6973C25.9349 21.7559 25.8991 21.8079 25.8535 21.8535C25.8079 21.8991 25.7542 21.9349 25.6924 21.9609C25.6338 21.987 25.5703 22 25.502 22H16.498Z" fill="currentColor"/>
  </svg>
);

export const MaximizeIcon = (p: P) => (
  <svg width="10" height="10" viewBox="52 17 10 10" fill="none" {...p}>
    <path d="M53.4746 27C53.2793 27 53.0921 26.9609 52.9131 26.8828C52.734 26.8014 52.5762 26.694 52.4395 26.5605C52.306 26.4238 52.1986 26.266 52.1172 26.0869C52.0391 25.9079 52 25.7207 52 25.5254V18.4746C52 18.2793 52.0391 18.0921 52.1172 17.9131C52.1986 17.734 52.306 17.5778 52.4395 17.4443C52.5762 17.3076 52.734 17.2002 52.9131 17.1221C53.0921 17.0407 53.2793 17 53.4746 17H60.5254C60.7207 17 60.9079 17.0407 61.0869 17.1221C61.266 17.2002 61.4222 17.3076 61.5557 17.4443C61.6924 17.5778 61.7998 17.734 61.8779 17.9131C61.9593 18.0921 62 18.2793 62 18.4746V25.5254C62 25.7207 61.9593 25.9079 61.8779 26.0869C61.7998 26.266 61.6924 26.4238 61.5557 26.5605C61.4222 26.694 61.266 26.8014 61.0869 26.8828C60.9079 26.9609 60.7207 27 60.5254 27H53.4746ZM60.501 25.999C60.5693 25.999 60.6328 25.986 60.6914 25.96C60.7533 25.9339 60.807 25.8981 60.8525 25.8525C60.8981 25.807 60.9339 25.7549 60.96 25.6963C60.986 25.6344 60.999 25.5693 60.999 25.501V18.499C60.999 18.4307 60.986 18.3672 60.96 18.3086C60.9339 18.2467 60.8981 18.193 60.8525 18.1475C60.807 18.1019 60.7533 18.0661 60.6914 18.04C60.6328 18.014 60.5693 18.001 60.501 18.001H53.499C53.4307 18.001 53.3656 18.014 53.3037 18.04C53.2451 18.0661 53.193 18.1019 53.1475 18.1475C53.1019 18.193 53.0661 18.2467 53.04 18.3086C53.014 18.3672 53.001 18.4307 53.001 18.499V25.501C53.001 25.5693 53.014 25.6344 53.04 25.6963C53.0661 25.7549 53.1019 25.807 53.1475 25.8525C53.193 25.8981 53.2451 25.9339 53.3037 25.96C53.3656 25.986 53.4307 25.999 53.499 25.999H60.501Z" fill="currentColor"/>
  </svg>
);

export const RestoreIcon = (p: P) => (
  <svg width="10" height="10" viewBox="88 17 10 10" fill="none" {...p}>
    <path d="M96.9283 26.6426H90.8569C90.4624 26.6426 90.1426 26.3228 90.1426 25.9283V19.8569C90.1426 19.4624 90.4624 19.1426 90.8569 19.1426H96.9283C97.3228 19.1426 97.6426 19.4624 97.6426 19.8569V25.9283C97.6426 26.3228 97.3228 26.6426 96.9283 26.6426Z" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor"/>
    <path d="M88.3569 24.4998V18.0712C88.3569 17.8818 88.4322 17.7001 88.5661 17.5661C88.7001 17.4322 88.8818 17.3569 89.0712 17.3569H95.4998" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor"/>
  </svg>
);

export const FullscreenIcon = (p: P) => (
  <svg width="10" height="10" viewBox="124 17 10 10" fill="none" {...p}>
    <path d="M130.071 20.9284L133.643 17.3569" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor"/>
    <path d="M130.786 17.3569H133.643V20.2141" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor"/>
    <path d="M127.928 20.9284L124.357 17.3569" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor"/>
    <path d="M127.214 17.3569H124.357V20.2141" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor"/>
    <path d="M130.071 23.0713L133.643 26.6427" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor"/>
    <path d="M130.786 26.6428H133.643V23.7856" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor"/>
    <path d="M127.928 23.0713L124.357 26.6427" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor"/>
    <path d="M127.214 26.6428H124.357V23.7856" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor"/>
  </svg>
);

export const ExitFullscreenIcon = (p: P) => (
  <svg width="10" height="10" viewBox="160 17 10 10" fill="none" {...p}>
    <path d="M160.357 26.6428L163.214 23.7856" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor"/>
    <path d="M160.714 23.7856H163.214V26.2856" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor"/>
    <path d="M169.643 26.6428L166.786 23.7856" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor"/>
    <path d="M169.286 23.7856H166.786V26.2856" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor"/>
    <path d="M160.357 17.3569L163.214 20.2141" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor"/>
    <path d="M160.714 20.2139H163.214V17.7139" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor"/>
    <path d="M169.643 17.3569L166.786 20.2141" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor"/>
    <path d="M169.286 20.2139H166.786V17.7139" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor"/>
  </svg>
);

export const CloseIcon = (p: P) => (
  <svg width="10" height="10" viewBox="196 17 10 10" fill="none" {...p}>
    <path d="M201 22.708L196.854 26.8535C196.757 26.9512 196.64 27 196.503 27C196.36 27 196.239 26.9528 196.142 26.8584C196.047 26.7607 196 26.6403 196 26.4971C196 26.3604 196.049 26.2432 196.146 26.1455L200.292 22L196.146 17.8545C196.049 17.7568 196 17.638 196 17.498C196 17.4297 196.013 17.3646 196.039 17.3027C196.065 17.2409 196.101 17.1888 196.146 17.1465C196.192 17.1009 196.246 17.0651 196.308 17.0391C196.369 17.013 196.435 17 196.503 17C196.64 17 196.757 17.0488 196.854 17.1465L201 21.292L205.146 17.1465C205.243 17.0488 205.362 17 205.502 17C205.57 17 205.634 17.013 205.692 17.0391C205.754 17.0651 205.808 17.1009 205.854 17.1465C205.899 17.1921 205.935 17.2458 205.961 17.3076C205.987 17.3662 206 17.4297 206 17.498C206 17.638 205.951 17.7568 205.854 17.8545L201.708 22L205.854 26.1455C205.951 26.2432 206 26.3604 206 26.4971C206 26.5654 205.987 26.6305 205.961 26.6924C205.935 26.7542 205.899 26.8079 205.854 26.8535C205.811 26.8991 205.759 26.9349 205.697 26.9609C205.635 26.987 205.57 27 205.502 27C205.362 27 205.243 26.9512 205.146 26.8535L201 22.708Z" fill="currentColor"/>
  </svg>
);


/** Menu button icon (the design's list-in-a-box glyph). */
export const MenuGlyph = (p: P) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" {...p}>
    <rect x="1.5" y="1.5" width="13" height="13" rx="2.6" />
    <path d="M4.6 5.6h6.8M4.6 8h6.8M4.6 10.4h4" strokeLinecap="round" />
  </svg>
);

/** Back to the first view: a window with an arrow pointing left (as in the design). */
export const HomeGlyph = (p: P) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" {...p}>
    <rect x="1.5" y="1.5" width="13" height="13" rx="2.6" />
    <path d="M1.5 5h13" />
    <path d="M10.6 9.9H6M7.7 8.2 6 9.9l1.7 1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
