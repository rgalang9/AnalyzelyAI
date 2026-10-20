# Learn Feature Plan

## Goal
Interactive coding lessons inside Analyzely, simple enough for a 15-year-old.
Release order: SQL, then Python, then R, then Stata.

## Lesson style (like SQLBolt)
- Short, friendly explanation of ONE new idea per lesson.
- One worked example before the learner tries anything.
- 3-5 small tasks per lesson on a dataset we provide.
- The learner writes code in an editor; results show instantly.
- Wrong answer: show a hint first. If still stuck, show a pop-up with example code.
  Hovering each line of the example explains it in plain words.
- Review lessons every few lessons mix old concepts together.

## Datasets
- Analyzely provides all practice datasets (no user uploads here).
- Start with one table; add new tables only when a concept needs them (e.g. JOINs).

## How it's built
- Content is separate from code: each lesson is a data file holding the
  explanation, tasks, expected results, and hover explanations.
  Adding a lesson = adding a file, no new code.
- One shared lesson page that works for every language.
- Each language has its own "runner":
  - SQL: sql.js (runs in the browser, no server)
  - Python: Pyodide (later)
  - R and Stata: decided later
- Folder layout: a learn section in the app, one folder per language,
  each holding its lessons, datasets, and runner.

## Progress
- Logged-in users: progress saved in Supabase (migration files, row-level security).
- Guests: can learn, but progress isn't saved.

## Releasing languages
- Release status for every language lives in ONE config setting.
- Unreleased languages show as "Coming soon" in the Learn dropdown and can't be clicked.

## SQL curriculum
Every lesson has 5 tasks: tasks 1-3 practise the new idea, tasks 4-5 mix it with older ideas.

Lesson 0: How to read a table (no typing; hover tour + click quiz)

Level 1: Basics (video games table)
1. SELECT, columns, DISTINCT
2. WHERE with numbers: AND, OR, BETWEEN
3. WHERE with text (LIKE, IN), ORDER BY, LIMIT
4. Review (sneaker store table)

Level 2: Shaping data
5. NULL values, calculations, AS
6. Text and date functions
7. CASE WHEN
8. Review

Level 3: Summarising
9. COUNT, SUM, AVG, MIN, MAX
10. GROUP BY
11. HAVING, and the order SQL runs things in
12. Review

Level 4: Joins (adds studios and sales tables)
13. INNER JOIN basics
14. JOINs with filters and grouping
15. LEFT JOIN, finding what's missing
16. Joining three tables
17. Review

Level 5: Pro skills
18. Subqueries
19. WITH (CTEs)
20. Changing data: INSERT, UPDATE, DELETE
21. Final case study (new set of related tables)

## Anti-rush rules
- Code editor stays locked until the learner presses "Got it" on the explanation.
- Hints unlock after a short pause, so learners can't spam answers.
- Some tasks ask the learner to predict the result before running the query.

## Content ownership
- All lesson text, tasks, and datasets are written by Raph (with Claude chat) and pasted in.
- Claude Code builds the engine only. Never write, rewrite, or "improve" lesson content.

## Rules
- Build in phases. Stop after each phase for testing and a commit.
- Follow CLAUDE.md rules at all times.

## Learning principles (apply to every lesson)
- One new idea per lesson. Never two.
- Explain first, then show one worked example, then let them try.
- Start easy and get slightly harder with each task (small wins build confidence).
- Learners always type the code themselves. No copy-paste buttons.
- Instant feedback: show their result table right away, next to the expected result.
- Mistakes are normal: use friendly, encouraging messages, never "Wrong!"
- Help ladder when they get it wrong:
  1st try: a short hint
  2nd try: a bigger hint pointing at the exact part to fix
  3rd try: the example pop-up with hover explanations, then they type it themselves
- Progress is locked: no skipping tasks or lessons until the current one is solved.
- Review lessons every 3-4 lessons mix old ideas together so they stick.
- Each lesson ends with a short recap: "You just learned..." in one or two sentences.
- Keep language simple enough for a 15-year-old. Explain any new word the first time it appears.
- Keep lessons short: about 5-10 minutes each.

