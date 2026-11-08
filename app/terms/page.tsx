import type { Metadata } from "next";
import LegalPage, { CONTACT_EMAIL, type LegalSection } from "../legal-page";

export const metadata: Metadata = { title: "Terms of Service · Analyzely" };

// Word for word from the Terms of Service section of LEGAL.md
const SECTIONS: LegalSection[] = [
  {
    heading: "Who we are",
    body: [
      `Analyzely ("we", "us") is operated by Raphael Galang, an individual based in Connecticut, USA. Contact: ${CONTACT_EMAIL}. By creating an account or using analyzely.io, you agree to these Terms.`,
    ],
  },
  {
    heading: "What Analyzely does",
    body: [
      "Analyzely lets you upload spreadsheets and ask questions about them using AI, take interactive lessons in SQL, Python, Excel and R, and play the Daily Case. AI answers can be wrong. Check important results yourself before relying on them.",
    ],
  },
  {
    heading: "Who can use it",
    body: [
      "You must be at least 13 years old. If you are under 18, you need a parent or guardian's permission to buy a paid plan.",
    ],
  },
  {
    heading: "Your account",
    body: [
      "Keep your password safe. You are responsible for activity on your account. One person per account; do not share logins or create accounts to get around usage limits.",
    ],
  },
  {
    heading: "Plans and billing",
    body: [
      [
        "Free: Level 1 of every course, today's Daily Case, 10 AI questions a month, files up to 3,000 cells.",
        "Pro, $4.99/month: all lessons, the last 30 days of Daily Cases, 50 AI questions a month, files up to 10,000 cells.",
        "Premium, $9.99/month: all lessons, the full Daily Case archive with solutions, 100 AI questions a month, files up to 50,000 cells.",
      ],
      "Prices include applicable sales tax. Payments are processed by Stripe; we never see or store your full card number.",
    ],
  },
  {
    heading: "Automatic renewal",
    body: [
      "Paid plans renew automatically every month at the then-current price, charged to your saved payment method, until you cancel. We will tell you in advance by email if a price changes.",
    ],
  },
  {
    heading: "Cancelling and refunds",
    body: [
      `You can cancel anytime from Manage subscription in your account menu, with no need to contact us. When you cancel, you keep your plan until the end of the month you already paid for, then move to Free. Payments are non-refundable except where the law requires otherwise, or at our discretion if something went wrong on our side; contact ${CONTACT_EMAIL}.`,
    ],
  },
  {
    heading: "Changing plans",
    body: [
      "If you upgrade, you pay the difference for the rest of the current month. If you downgrade, the change takes effect at the end of the current month.",
    ],
  },
  {
    heading: "Acceptable use",
    body: [
      "Do not: upload files you have no right to use or that contain other people's sensitive personal data without permission; try to break, overload, scrape or reverse-engineer the service; get around usage limits or paywalls; share paid lesson content publicly; or use Analyzely for anything illegal. We may suspend accounts that break these rules.",
    ],
  },
  {
    heading: "Your content",
    body: [
      "Files you upload stay yours. You give us permission to store and process them only to run the service for you, including sending parts of them to our AI provider to answer your questions. You can delete your saved analyses at any time.",
    ],
  },
  {
    heading: "Our content",
    body: [
      "Lessons, cases, datasets, design and code belong to Analyzely. You may use them for your own learning, not copy or resell them.",
    ],
  },
  {
    heading: "No warranty",
    body: [
      'Analyzely is provided "as is". We do our best to keep it running and accurate, but we do not guarantee it will always be available, error-free, or that AI answers are correct.',
    ],
  },
  {
    heading: "Limit of liability",
    body: [
      "To the extent the law allows, our total liability to you for any claim is limited to the amount you paid us in the 12 months before the claim. We are not liable for indirect or lost-profit damages.",
    ],
  },
  {
    heading: "Ending your account",
    body: [
      `You can stop using Analyzely and ask us to delete your account at any time by emailing ${CONTACT_EMAIL}. We may close accounts that break these Terms.`,
    ],
  },
  {
    heading: "Changes to these Terms",
    body: [
      "We may update these Terms. For important changes we will notify you by email or in the app before they take effect. Continuing to use Analyzely after that means you accept the new Terms.",
    ],
  },
  {
    heading: "Law",
    body: ["These Terms are governed by the laws of the State of Connecticut, USA."],
  },
];

export default function TermsPage() {
  return <LegalPage title="Terms of Service" sections={SECTIONS} />;
}
