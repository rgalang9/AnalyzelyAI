import type { Metadata } from "next";
import LegalPage, { CONTACT_EMAIL, type LegalSection } from "../legal-page";

export const metadata: Metadata = { title: "Privacy Policy · Analyzely" };

// Word for word from the Privacy Policy section of LEGAL.md
const SECTIONS: LegalSection[] = [
  {
    heading: "What we collect",
    body: [
      [
        "Account info: your email address and a securely scrambled password, or your Google account email if you sign in with Google.",
        "Files and questions: spreadsheets you upload and the questions you ask, when you are signed in and save an analysis.",
        "Learning data: which lessons you finish and your Daily Case results.",
        "Usage counts: how many AI questions and AI features you use, to apply plan limits.",
        "Billing info: your plan and subscription status. Stripe handles card details; we never store them.",
        "Basic technical data: standard server logs (like browser type and IP address) kept by our hosting provider for security and debugging.",
      ],
    ],
  },
  {
    heading: "How we use it",
    body: [
      "To run your account, answer your questions, save your progress, apply plan limits, process payments, prevent abuse, and fix bugs. We do not sell your data, and we do not use your files for advertising.",
    ],
  },
  {
    heading: "Who we share it with",
    body: [
      "Only the services that run Analyzely:",
      [
        "Supabase: database and sign-in.",
        "Vercel: website hosting.",
        "Anthropic: AI provider. To answer a question, we send column names and a sample of rows from your file, plus your question. Anthropic does not use this data to train its models under its commercial terms.",
        "Stripe: payments and sales tax.",
      ],
      "We may also share data if the law requires it.",
    ],
  },
  {
    heading: "How long we keep it",
    body: [
      "We keep your account data while your account exists. Saved analyses stay until you delete them. When you delete your account, we delete your data within 30 days, except billing records we must keep for tax purposes.",
    ],
  },
  {
    heading: "Your choices and rights",
    body: [
      `You can view, download or delete your data, or ask us to correct it, by emailing ${CONTACT_EMAIL}. Depending on where you live, you may have extra rights under laws such as California's CCPA or the EU's GDPR; we will honour those requests.`,
    ],
  },
  {
    heading: "Security",
    body: [
      "Data is sent over HTTPS, and our database restricts each user to their own records. No system is perfectly secure, so please use a strong password.",
    ],
  },
  {
    heading: "Children",
    body: [
      "Analyzely is not meant for children under 13, and we do not knowingly collect their data. If you believe a child under 13 has an account, contact us and we will delete it.",
    ],
  },
  {
    heading: "Cookies",
    body: [
      "We use only the cookies needed to keep you signed in and to process payments. We do not use advertising cookies. We use Vercel Web Analytics, which counts page visits without cookies and doesn't track people across sites.",
    ],
  },
  {
    heading: "Changes",
    body: [
      "We will post updates here and change the date at the top. For important changes we will notify you by email or in the app.",
    ],
  },
  {
    heading: "Contact",
    body: [`Raphael Galang, Analyzely, ${CONTACT_EMAIL}.`],
  },
];

export default function PrivacyPage() {
  return <LegalPage title="Privacy Policy" sections={SECTIONS} />;
}
