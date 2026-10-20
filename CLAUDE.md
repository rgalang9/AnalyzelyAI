# Analyzely: rules for Claude Code

## About me
I'm learning as I build and don't read code well yet. Explain changes in plain language, and keep each step small so I can test and commit.

## Replacing vs. removing
- If something I ask for fully replaces an existing feature or piece of code, delete the old version so there are no duplicates.
- Do NOT remove or change any feature I didn't mention. Everything that works now should keep working.
- Never do large rewrites or restructure the app unless I ask for it.
- If you're unsure whether something should be deleted, ask me first instead of guessing.
- Whenever you delete or rename something, tell me what and why.

## Keep the code clean
- Before adding new code, check if something similar already exists and reuse or update it.
- Don't leave unused files or code behind after a change.

## Safety
- Never put API keys or secrets in the code. They go in .env.local only.
- Any database change must be saved as a Supabase migration file in the repo.
- Users can only see their own saved data.

## Workflow
- Stop after each step so I can test at localhost:3000 and commit.