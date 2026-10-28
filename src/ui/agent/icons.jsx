const stroke = { fill: 'none', stroke: 'currentColor' };

function Svg({ width = 1.7, children, viewBox = '0 0 24 24' }) {
  return (
    <svg viewBox={viewBox} {...stroke} strokeWidth={width} aria-hidden="true">
      {children}
    </svg>
  );
}

export const IconAgent = () => (
  <Svg>
    <rect x="4" y="7" width="16" height="12" rx="3" />
    <path d="M12 3v4" />
    <circle cx="9" cy="13" r="1.2" />
    <circle cx="15" cy="13" r="1.2" />
    <path d="M9.5 16.5h5" />
  </Svg>
);

export const IconPlus = () => (
  <Svg width={1.9}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconList = () => (
  <Svg>
    <path d="M8 6h12M8 12h12M8 18h12" />
    <circle cx="4" cy="6" r="1.1" />
    <circle cx="4" cy="12" r="1.1" />
    <circle cx="4" cy="18" r="1.1" />
  </Svg>
);

export const IconInfo = () => (
  <Svg>
    <circle cx="12" cy="12" r="8.4" />
    <path d="M12 11v5.5" />
    <circle cx="12" cy="8" r=".9" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconTrash = () => (
  <Svg>
    <path d="M5 7h14" />
    <path d="M9 7V5h6v2" />
    <path d="M7 7l1 13h8l1-13" />
  </Svg>
);

export const IconClose = () => (
  <Svg width={1.9}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const IconSend = () => (
  <Svg width={1.8}>
    <path d="M4 12l16-8-6 16-3-6z" />
    <path d="M11 14l9-10" />
  </Svg>
);

export const IconStop = () => (
  <Svg width={1.8}>
    <rect x="7" y="7" width="10" height="10" rx="2" />
  </Svg>
);

export const IconCopy = () => (
  <Svg>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h8" />
  </Svg>
);

export const IconChevron = () => (
  <Svg width={2}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);

export const IconCaretDown = () => (
  <Svg width={2}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);

export const IconGlobe = () => (
  <Svg>
    <circle cx="12" cy="12" r="8.4" />
    <path d="M3.6 12h16.8" />
    <path d="M12 3.6c2.6 2.3 3.9 5.1 3.9 8.4s-1.3 6.1-3.9 8.4c-2.6-2.3-3.9-5.1-3.9-8.4S9.4 5.9 12 3.6z" />
  </Svg>
);

export const IconCheck = () => (
  <Svg width={2}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </Svg>
);

export const IconFold = () => (
  <Svg>
    <path d="M4 9l8-5 8 5" />
    <path d="M4 15l8 5 8-5" />
  </Svg>
);

export const IconFoldAll = () => (
  <Svg>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const IconAlert = () => (
  <Svg width={2}>
    <path d="M12 8v5" />
    <circle cx="12" cy="16.4" r=".9" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="8.4" />
  </Svg>
);
