import type { SVGProps } from 'react';

export type AppIconName =
  | 'home'
  | 'suppliers'
  | 'products'
  | 'lists'
  | 'orders'
  | 'settings'
  | 'logout'
  | 'chevron'
  | 'shield'
  | 'sparkles'
  | 'warning'
  | 'check'
  | 'arrow-right'
  | 'savings'
  | 'edit'
  | 'trash';

export function AppIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: AppIconName }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  return (
    <svg aria-hidden viewBox="0 0 24 24" {...common} {...props}>
      {name === 'home' && (
        <>
          <path d="m3.5 10.8 8.5-7 8.5 7" />
          <path d="M5.5 9.3v10.2h13V9.3M9.2 19.5v-6h5.6v6" />
        </>
      )}
      {name === 'suppliers' && (
        <>
          <path d="M4 20V7.5h10V20M14 11h3l3 3v6h-6" />
          <path d="M7.5 11h3M7.5 14.5h3M7.5 18h3" />
          <circle cx="8" cy="20" r="1.5" />
          <circle cx="17.5" cy="20" r="1.5" />
        </>
      )}
      {name === 'products' && (
        <>
          <path d="m4 7 8-4 8 4-8 4-8-4Z" />
          <path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z" />
          <path d="M12 11v10" />
        </>
      )}
      {name === 'lists' && (
        <>
          <path d="M6 3.5h9l3 3v14H6z" />
          <path d="M15 3.5v3h3M9 11h6M9 14.5h6M9 18h4" />
        </>
      )}
      {name === 'orders' && (
        <>
          <path d="M5 4h14v16H5z" />
          <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
          <path d="M8 4V2.5M16 4V2.5" />
        </>
      )}
      {name === 'settings' && (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
        </>
      )}
      {name === 'logout' && (
        <>
          <path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10" />
        </>
      )}
      {name === 'chevron' && <path d="m9 5 7 7-7 7" />}
      {name === 'shield' && (
        <>
          <path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z" />
          <path d="m9 12 2 2 4-4" />
        </>
      )}
      {name === 'sparkles' && (
        <>
          <path d="m12 3 1.2 3.3L16.5 7.5l-3.3 1.2L12 12l-1.2-3.3-3.3-1.2 3.3-1.2L12 3Z" />
          <path d="m18.5 13 .7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" />
          <path d="m6 14 .9 2.1L9 17l-2.1.9L6 20l-.9-2.1L3 17l2.1-.9L6 14Z" />
        </>
      )}
      {name === 'warning' && (
        <>
          <path d="M12 3.5 2.8 20h18.4L12 3.5Z" />
          <path d="M12 9v5M12 17.3h.01" />
        </>
      )}
      {name === 'check' && <path d="m5 12.5 4.2 4L19 7" />}
      {name === 'edit' && (
        <>
          <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" />
          <path d="m14.5 7.5 2 2" />
        </>
      )}
      {name === 'trash' && (
        <>
          <path d="M4.5 6.5h15M9.5 6.5V4.5h5v2" />
          <path d="M6.5 6.5 7.5 20h9l1-13.5" />
          <path d="M10.5 10v6M13.5 10v6" />
        </>
      )}
      {name === 'savings' && (
        <>
          <path d="M4.5 9.5h11a4.5 4.5 0 0 1 0 9h-11a4.5 4.5 0 0 1 0-9Z" />
          <path d="M15.5 12.2h2.8M8.5 9.5V7a2.5 2.5 0 0 1 5 0" />
          <circle cx="9" cy="14" r="2.2" />
        </>
      )}
      {name === 'arrow-right' && (
        <>
          <path d="M4 12h15M14 7l5 5-5 5" />
        </>
      )}
    </svg>
  );
}
