import Link from "next/link";
import { AppRail, MobileNav } from "@/components/app-shell";

/** Static composition, no shimmer: the real rail, a title rule, the tab row, and a few text lines. */
export default function PassageLoading() {
  return (
    <div className="relative min-h-full lg:pl-[13.5rem]">
      <AppRail current="/library" />
      <MobileNav current="/library" />
      <div className="mx-auto flex w-full max-w-[47rem] flex-col px-5 pt-7 sm:px-8 sm:pt-9">
        <header className="flex items-center justify-between gap-4">
          <Link href="/library" className="t-quiet">
            ← Library
          </Link>
          <div className="h-[22px] w-[104px] rounded-[4px] border border-rule" />
        </header>
        <div className="mt-12 sm:mt-14">
          <div className="h-2.5 w-24 rounded-[2px] bg-rule/70" />
          <div className="mt-5 h-10 w-3/4 rounded-[3px] bg-rule/80" />
          <div className="mt-5 h-px w-14 bg-ink/15" />
        </div>
        <div className="sheet mt-9 px-5 pb-10 sm:px-9">
          <div className="-mx-5 flex gap-7 border-b border-rule/70 px-5 py-5 sm:-mx-9 sm:px-9">
            <div className="h-2.5 w-12 rounded-[2px] bg-rule/60" />
            <div className="h-2.5 w-14 rounded-[2px] bg-rule/60" />
            <div className="h-2.5 w-14 rounded-[2px] bg-rule/60" />
          </div>
          <div className="mt-10 space-y-5">
            <div className="h-5 w-full rounded-[2px] bg-rule/55" />
            <div className="h-5 w-11/12 rounded-[2px] bg-rule/55" />
            <div className="h-5 w-full rounded-[2px] bg-rule/55" />
            <div className="h-5 w-2/3 rounded-[2px] bg-rule/55" />
          </div>
        </div>
      </div>
    </div>
  );
}
