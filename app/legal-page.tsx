import { Fragment } from "react";

// One numbered section of a legal page: a heading, then paragraphs and/or bullet lists.
// A string is a paragraph; an array of strings is a bullet list.
export type LegalSection = { heading: string; body: (string | string[])[] };

export const CONTACT_EMAIL = "raphaelgalang3@gmail.com";
export const LAST_UPDATED = "11/8/2026";

// Turns the contact email into a clickable link, leaving the rest of the text as is
function withEmailLink(text: string) {
  const parts = text.split(CONTACT_EMAIL);
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 && (
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-purple hover:underline">
          {CONTACT_EMAIL}
        </a>
      )}
    </Fragment>
  ));
}

// Bullets like "Free: Level 1 of..." get the part before the colon in bold, for easy scanning
function Bullet({ text }: { text: string }) {
  const colon = text.indexOf(": ");
  if (colon === -1 || colon > 40) return <>{withEmailLink(text)}</>;
  return (
    <>
      <strong className="font-semibold text-navy">{text.slice(0, colon + 1)}</strong>
      {withEmailLink(text.slice(colon + 1))}
    </>
  );
}

// Shared look for the Terms and Privacy pages: a readable column of numbered sections
export default function LegalPage({ title, sections }: { title: string; sections: LegalSection[] }) {
  return (
    <main className="flex flex-1 flex-col bg-white bg-linear-to-b from-purple-light/30 to-white px-4 py-10 text-navy sm:px-6 sm:py-14">
      <article className="mx-auto w-full max-w-2xl">
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-3 text-sm text-grey">Last updated: {LAST_UPDATED}</p>

        <div className="mt-10 flex flex-col gap-8">
          {sections.map((section, index) => (
            <section key={section.heading}>
              <h2 className="font-display text-xl font-extrabold">
                {index + 1}. {section.heading}
              </h2>
              {section.body.map((block, i) =>
                typeof block === "string" ? (
                  <p key={i} className="mt-3 leading-relaxed text-grey">
                    {withEmailLink(block)}
                  </p>
                ) : (
                  <ul key={i} className="mt-3 flex list-disc flex-col gap-2 pl-5 leading-relaxed text-grey marker:text-purple">
                    {block.map((item) => (
                      <li key={item}>
                        <Bullet text={item} />
                      </li>
                    ))}
                  </ul>
                )
              )}
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
