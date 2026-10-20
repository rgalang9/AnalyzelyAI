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

## Rules
- Build in phases. Stop after each phase for testing and a commit.
- Follow CLAUDE.md rules at all times.