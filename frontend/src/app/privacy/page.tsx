import type { Metadata } from "next";
import Link from "next/link";
import { LegalHeading, LegalPage, Mail } from "@/components/legal";
import { CONTACT_EMAIL } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Privacy",
};

const PROCESSORS: { name: string; what: string }[] = [
  { name: "Supabase", what: "sign-in (email and password) and the database that holds your progress" },
  { name: "Stripe", what: "payments, invoices, and tax. Lociros never sees your full card number" },
  { name: "OpenRouter", what: "writes custom and daily passages, glosses, and translations from the topic text only" },
  { name: "Vercel", what: "hosts the website and measures page speed without cookies" },
  { name: "Amazon Web Services", what: "runs the reading engine (Lightsail)" },
  { name: "Microsoft Azure Speech", what: "recorded audio for catalog passages. It never receives your data" },
  { name: "Sentry", what: "error reports, so we can fix crashes. Reports exclude passwords and payment data" },
];

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <p>
        This notice explains what Lociros keeps, why, who helps us run it, and how to see or delete
        it. Lociros does not sell your data, run advertising, or use third-party tracking cookies.
      </p>

      <LegalHeading>On this browser</LegalHeading>
      <p>
        A random device id (in local storage and a first-party cookie), the language you last
        chose, and reader settings such as grammar color, furigana, and fading known words. If you
        sign in, Supabase sets a first-party cookie to keep you signed in. These are needed for the
        service to work, so there is no cookie banner.
      </p>

      <LegalHeading>On our servers</LegalHeading>
      <p>
        Your level for each language, passages you read and rate, words you tap and save, review
        cards, comprehension answers, custom passage topics, and simple usage events such as
        finishing a placement read or opening the plans page. Before you sign in these sit under
        the device id; when you sign in they move onto your account.
      </p>
      <p>
        With an account we also keep your email, display name, and subscription state (plan,
        renewal date, and a Stripe customer id). Payment details stay with Stripe.
      </p>

      <LegalHeading>Why</LegalHeading>
      <p>
        To provide the service you signed up for (contract), to bill you (contract and legal
        obligation for tax records), and to keep the service working and improve it (legitimate
        interest, using aggregated usage counts).
      </p>

      <LegalHeading>Who processes it</LegalHeading>
      <ul className="flex flex-col gap-2">
        {PROCESSORS.map((p) => (
          <li key={p.name}>
            <span className="text-ink">{p.name}</span>: {p.what}.
          </li>
        ))}
      </ul>
      <p>
        Some of these process data outside your country, including in the United States, under
        standard contractual clauses or an equivalent safeguard.
      </p>

      <LegalHeading>How long</LegalHeading>
      <p>
        Account data is kept while the account exists. Guest progress with no activity for 12
        months may be removed. Billing records are kept by Stripe for as long as tax law requires,
        even after you delete your account.
      </p>

      <LegalHeading>Your rights</LegalHeading>
      <p>
        You can download everything we hold about you, as one file, from{" "}
        <Link href="/settings" className="underline decoration-ink/25 underline-offset-2">
          Settings
        </Link>
        . Deleting your account there removes your account, sign-in, and reading data straight
        away and cancels any subscription. You can also ask us to correct or restrict your data,
        or object to how we use it, by writing to <Mail address={CONTACT_EMAIL} />. If you are in
        the EU or UK you may complain to your data protection authority.
      </p>

      <LegalHeading>Contact</LegalHeading>
      <p>
        Privacy questions and requests: <Mail address={CONTACT_EMAIL} />.
      </p>
    </LegalPage>
  );
}
