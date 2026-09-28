import { useId, type SVGProps } from "react";

/** Window, landscape, and open book — the Lociros mark. */
export function LogoMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  const id = useId().replace(/:/g, "");
  const windowId = `${id}-window`;
  const pagesId = `${id}-pages`;

  return (
    <svg
      viewBox="0 0 160 176"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <defs>
        <clipPath id={windowId}>
          <path d="M36 152V80C36 56 52 32 80 22C108 32 124 56 124 80V152Z" />
        </clipPath>
        <clipPath id={pagesId}>
          <path d="M16 136C11 147 11 156 19 160H70c4-5 7-9 10-12 3 3 6 7 10 12h51c8-4 8-13 3-24-17-12-37-2-53 7-16-9-36-19-53-7Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${windowId})`}>
        <path fill="#A7B0B7" d="M38 114c18-14 32-8 44-22 16 16 28 6 40 16v48H38V114Z" />
        <path fill="#6B7F6E" d="M38 134c18-12 34-6 50-18 14 10 24 4 34 8v32H38v-22Z" />
        <circle cx="102" cy="51" r="10" fill="#B35C45" />
        <path
          fill="#1F2F4B"
          d="M49 120c-1.4-16-2-34 2.4-52 1.8-10 3.4-17 5.6-23 2.2 6 3.8 13 5.6 23 4.4 18 3.8 36 2.4 52-3.4 4-12.6 4-16 0Z"
        />
        <path fill="#F4EFE6" d="m94 112 7.2-6.6L108.4 112Z" />
        <path fill="#F4EFE6" d="M93 111.6h16v2.4H93Z" />
        <path fill="#F4EFE6" d="M94.6 114h2.3v6.8h-2.3zm5.2 0h2.3v6.8h-2.3zm5.2 0h2.3v6.8h-2.3Z" />
      </g>
      <path
        fill="#1F2F4B"
        fillRule="evenodd"
        d="M14 140V78C14 46 38 16 80 5C122 16 146 46 146 78V140H124V80C124 56 110 32 80 23C50 32 36 56 36 80V140H14Z"
      />
      <path
        fill="#1F2F4B"
        d="M2 132c-4 13-2 26 6 30h60c5 0 8 5 12 10 4-5 7-10 12-10h60c8-4 10-17 6-30-18-14-46-4-78 8-32-12-60-22-78-8Z"
      />
      <g clipPath={`url(#${pagesId})`}>
        <rect width="160" height="56" y="120" fill="#FBF7F0" />
        <path
          d="M18 140c20-14 40-8 54 8"
          stroke="#1F2F4B"
          strokeWidth="4.2"
          strokeLinecap="round"
        />
        <path
          d="M16 150c22-14 42-6 58 8"
          stroke="#1F2F4B"
          strokeWidth="3.8"
          strokeLinecap="round"
        />
        <path
          d="M142 140c-20-14-40-8-54 8"
          stroke="#1F2F4B"
          strokeWidth="4.2"
          strokeLinecap="round"
        />
        <path
          d="M144 150c-22-14-42-6-58 8"
          stroke="#1F2F4B"
          strokeWidth="3.8"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
