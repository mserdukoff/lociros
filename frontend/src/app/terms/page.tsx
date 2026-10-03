import type { Metadata } from "next";
import Link from "next/link";
import { LegalHeading, LegalPage, Mail } from "@/components/legal";
import { CONTACT_EMAIL } from "@/lib/contact";
import { TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Terms",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms">
      <p>
        These terms cover your use of Lociros, a reading-practice service for Japanese, Arabic,
        Italian, and Russian. By creating an account or subscribing you agree to them. If you
        don&apos;t agree, don&apos;t use the service.
      </p>

      <LegalHeading>What Lociros is</LegalHeading>
      <p>
        Lociros offers short graded passages, word glosses, and review. It is a study tool, not a
        course, a certificate, or a substitute for a teacher. Levels are checked mechanically by a
        morphological analyzer, and a passage, gloss, or translation can still be wrong.
      </p>

      <LegalHeading>Accounts</LegalHeading>
      <p>
        You need an account to read beyond the first passage. Keep your password private; you are
        responsible for what happens under your account. You must be at least 13, or the minimum
        age of digital consent where you live if that is higher.
      </p>

      <LegalHeading>Free week and subscriptions</LegalHeading>
      <p>
        A new account gets {TRIAL_DAYS} days of full access with no card. After that, reading needs
        a paid subscription, billed monthly or yearly in advance through Stripe. Prices are shown on
        the{" "}
        <Link href="/pricing" className="underline decoration-ink/25 underline-offset-2">
          plans page
        </Link>{" "}
        and at checkout, plus sales tax or VAT where it applies.
      </p>
      <p>
        Subscriptions renew automatically at the end of each period until you cancel. If you
        subscribe during the free week, the first charge is taken when the week ends. We will tell
        you at least 30 days ahead of any price change, and it applies from your next renewal.
      </p>
      <p>
        If a payment fails, Stripe retries it for a short period and access continues meanwhile.
        If it still fails, the subscription ends and the shelf closes until you subscribe again.
      </p>

      <LegalHeading>Cancelling</LegalHeading>
      <p>
        Cancel any time from Settings, under Manage billing. Access continues until the end of the
        period you have paid for, and you will not be charged again. Deleting your account cancels
        any subscription immediately.
      </p>

      <LegalHeading id="refunds">Refunds</LegalHeading>
      <p>
        If you are not happy, write to <Mail address={CONTACT_EMAIL} /> within 14 days of a charge
        and we will refund it in full, no questions asked. After 14 days, charges are not refunded,
        but you can cancel to stop the next one. This does not limit any statutory right you have,
        including the right of withdrawal for consumers in the EU and UK.
      </p>

      <LegalHeading>Fair use</LegalHeading>
      <p>
        Custom passages are limited to a set number each month, and requests are rate limited to
        keep the service running for everyone. Don&apos;t scrape the catalog, resell access, share
        an account, or try to get around the limits or the paywall. We may suspend accounts that
        do.
      </p>

      <LegalHeading>Your content and ours</LegalHeading>
      <p>
        The passages, glosses, illustrations, and software are ours or our licensors&apos;. You may
        use them for your own study. Words you save and topics you type stay yours; you let us
        store and process them to run the service.
      </p>

      <LegalHeading>Changes and availability</LegalHeading>
      <p>
        We aim to keep Lociros available but cannot promise it will be uninterrupted. We may change
        features; if a change materially reduces what you pay for, you can cancel and ask for a
        pro-rated refund of the unused period. We will post updates to these terms here and email
        you about material ones.
      </p>

      <LegalHeading>Liability</LegalHeading>
      <p>
        The service is provided as is. To the extent the law allows, our total liability to you is
        limited to the amount you paid us in the twelve months before the claim.
      </p>

      <LegalHeading>Contact</LegalHeading>
      <p>
        Questions about these terms or a charge: <Mail address={CONTACT_EMAIL} />.
      </p>
    </LegalPage>
  );
}
