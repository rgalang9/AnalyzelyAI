Read CLAUDE.md, LEARN_PLAN.md and PYTHON_PLAN.md. Make a new branch called cleanup from the current branch.
GOAL: Make the codebase as small and well-organized as possible WITHOUT changing anything users see or do. Every page, button, lesson and feature must work exactly as it does now.

STEP 0: Change nothing yet. Audit the whole project and report in plain words:
1. Unused code: files, functions, components, exports, CSS and npm packages nothing uses. Use a tool like knip to find them, and double-check each by hand.
2. Dead leftovers: the old dark: Tailwind classes (now inactive), old sidebar/welcome-screen leftovers, commented-out code, duplicate helper functions.
3. Duplicates: code repeated in several places that should be one shared piece.
4. Organization: a proposed folder layout (e.g. app/ for pages only, components/ grouped by feature like landing, analyze, learn, shared, lib/ for logic), with a before → after list of every file you'd move.
5. Anything risky, and how you'd test it.
Then stop and wait for my OK.

RULES for the actual cleanup (after my OK):
- Do it in small steps: (a) delete unused code, (b) remove dark: classes, (c) merge duplicates, (d) move files into the new folders. Run npm run build, lint and the type check after each step.
- Never change lesson content (JSON/CSV/SQL files), Supabase migrations, .env files or what the AI is asked.
- After all steps: re-run the SQL lesson check you did before, test Python Lessons 0–1, and click through: landing, login/sign-up, upload, all 3 dataset tabs, My analyses (rename/delete/download), downloads as CSV and Excel.
- Tell me the results and how many lines/files were removed, then stop. Do not push.
