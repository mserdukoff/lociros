import Link from "next/link";
import { LineIcon } from "@/components/landing/art";
import { NAV_LINKS } from "@/components/reader-rail";

const SHORT: Record<string, string> = { Vocabulary: "Words" };

/** Bottom bar below `lg`, where the reader rail is hidden. */
export function MobileNav({ current }: { current?: string }) {
  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-rule bg-paper-raised/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-[40rem] grid-cols-4">
        {NAV_LINKS.map((link) => {
          const on = current === link.href;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={on ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] transition-colors ${
                  on ? "text-ink" : "text-ink/50 hover:text-ink"
                }`}
              >
                <LineIcon name={link.icon} className="h-5 w-5" />
                {SHORT[link.label] ?? link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
