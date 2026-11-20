import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 18, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const DeviceIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2.5" />
    <path d="M9.5 2.5v3M14.5 2.5v3M9.5 18.5v3M14.5 18.5v3M2.5 9.5h3M2.5 14.5h3M18.5 9.5h3M18.5 14.5h3" />
    <rect x="10" y="10" width="4" height="4" rx="0.8" />
  </Icon>
);

export const CloudIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 18.5h10.2a4.3 4.3 0 0 0 .7-8.54A6 6 0 0 0 6.3 8.9 4.8 4.8 0 0 0 7 18.5Z" />
  </Icon>
);

export const ListIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4 7 1.6 1.6L8.5 5.7M4 14l1.6 1.6 2.9-2.9M11.5 7.5H20M11.5 14.5H20M11.5 19H17" />
  </Icon>
);

export const LockIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" />
  </Icon>
);

export const BookIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 6.5c-1.8-1.3-4.2-1.8-7.5-1.6v13c3.3-.2 5.7.3 7.5 1.6 1.8-1.3 4.2-1.8 7.5-1.6v-13c-3.3-.2-5.7.3-7.5 1.6Z" />
    <path d="M12 6.5v13" />
  </Icon>
);

export const TextIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 18 8 6l5 12M4.8 14h6.4" />
    <path d="M21 18v-5.2a2.7 2.7 0 0 0-5.2-1" />
    <circle cx="18.2" cy="15.6" r="2.6" />
  </Icon>
);

export const PlayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4H4Z" />
    <path d="M16 9a4.5 4.5 0 0 1 0 6M18.8 6.5a8 8 0 0 1 0 11" />
  </Icon>
);

export const StopIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
  </Icon>
);

export const CopyIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="8.5" y="8.5" width="11" height="12" rx="2" />
    <path d="M15.5 8.5V6a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v8.5a2 2 0 0 0 2 2h2" />
  </Icon>
);

export const BookmarkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.8L6 20V5.5a1 1 0 0 1 1-1Z" />
  </Icon>
);

export const BackIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.5 5.5 4 12l6.5 6.5M4.5 12H20" />
  </Icon>
);

export const ColumnsIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <path d="M12 5v14" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5.5v13M5.5 12h13" />
  </Icon>
);

export const DownloadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4v11M7.5 11 12 15.5 16.5 11M5 19.5h14" />
  </Icon>
);

export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 7.5h14M10 7.5V5.2h4v2.3M7 7.5l.8 11.3a1 1 0 0 0 1 .9h6.4a1 1 0 0 0 1-.9L17 7.5" />
  </Icon>
);

export const OfflineIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4l16 16M8.6 13.3a5.2 5.2 0 0 1 2.2-1.3M5.3 10a9.6 9.6 0 0 1 2.6-1.8M11 7.2a9.7 9.7 0 0 1 7.7 2.8M14.6 12.4c.3.2.6.5.9.8" />
    <circle cx="12" cy="17.5" r="1" />
  </Icon>
);

export const PageIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5A1.5 1.5 0 0 1 7.5 3.5" />
    <path d="M9.5 12h5M9.5 15.5h5" />
  </Icon>
);

/** The PlainPage mark: a page whose lines get shorter and clearer. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="4" y="2.5" width="24" height="27" rx="6" fill="var(--accent)" />
      <path d="M10 10.5h12" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M10 16h9" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity="0.85" />
      <path d="M10 21.5h6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}
