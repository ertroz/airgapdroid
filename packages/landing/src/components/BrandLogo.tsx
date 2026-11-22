interface BrandLogoProps {
  className?: string;
  title?: string;
}

export function BrandLogo({ className = 'h-7 w-7', title = 'AirgapDroid' }: BrandLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1024 1024"
      className={className}
      role="img"
      aria-label={title}
    >
      <rect width="1024" height="1024" rx="224" fill="#111827" />
      <path
        d="M350 250 L292 166 M674 250 L732 166"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="48"
        strokeLinecap="round"
      />
      <path
        d="M220 474 C220 300 350 190 512 190 C674 190 804 300 804 474 L220 474 Z"
        fill="#FFFFFF"
      />
      <circle cx="382" cy="370" r="34" fill="#111827" />
      <circle cx="642" cy="370" r="34" fill="#111827" />
      <path
        d="M220 474 L512 592 L512 858 L290 746 C246 724 220 682 220 632 Z"
        fill="#FFFFFF"
      />
      <path
        d="M804 474 L512 592 L512 858 L734 746 C778 724 804 682 804 632 Z"
        fill="#E54D2E"
      />
      <path
        d="M220 474 L512 592 L804 474"
        fill="none"
        stroke="#111827"
        strokeWidth="34"
        strokeLinejoin="miter"
      />
      <path d="M512 592 L512 858" fill="none" stroke="#111827" strokeWidth="34" />
    </svg>
  );
}
