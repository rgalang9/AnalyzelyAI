This replaces the old lesson format.
Python Notebook Lessons — Format Spec
This spec replaces the SQL-style format for the Python course only. SQL stays as it is.
Why the change
• Real pandas work happens in Jupyter notebooks: stacked cells, with output under each cell.
• Reviews praise writing real code (Dataquest, Kaggle) and criticise heavy fill-in scaffolding (DataCamp).
• So learners should feel like they're in a notebook, and they learn by running code and seeing its result, not by hovering.
What stays
• All 32 topics, the lesson order, the datasets and the tested answers.
• Gating (you can't skip a cell), auto-unlocking hints, friendly errors, the Pyodide engine and the answer checks (print, value, table, chart).
What changes
• One lesson = one notebook. Cells are stacked top to bottom and scroll like Jupyter.
• Cells share memory. A variable made in cell 2 still exists in cell 5. Each cell shows a run counter like [3].
• Output appears under each cell: printed text, a pandas table or a chart.
• No hover explanations. Each new idea gets a short markdown cell (2–4 sentences) right before the code that uses it.
• There is no separate example block anymore. The first code cells are the worked example: the learner just runs them.
• The help ladder runs inside one notebook: run → predict → fill one blank → edit the cell → write the cell from scratch.
• The final cell is a mini challenge that combines the lesson's idea with earlier lessons.
Cell types (JSON)
• markdown: text only. Fields: text.
• run: prefilled code; the learner presses Run. Fields: code.
• predict: choose the output before running. Fields: code, options, answer.
• fill: code containing one ___. Fields: code, answer, compare, hints.
• write: an empty cell or a starter. Fields: prompt, starter, answer, compare, require, hints.
All code cells run in the same Python session, in order. A Restart & run all button rebuilds the state.
Pacing rules
• Lessons 0–2: one new idea each. At least half the cells are run or predict. Only one write cell, at the end, with a starter.
• Lessons 3–12: a write cell from scratch appears by mid-lesson.
• Lesson 13 onward: at most 2 run cells; most cells are write.
• Review lessons (6, 12, 18, 26, 31): a markdown brief at the top, then mostly blank write cells, like a real analysis notebook.
• New ideas reuse yesterday's code, so every lesson starts by loading data the familiar way.
Look
• The notebook area should look like JupyterLab: grey code cells, an In [n]: gutter, a white output area and a pandas-style table.
• The Analyzely brand stays on the frame around it, matching the redesign rule.
Rollout
1. Claude (chat) rewrites Lessons 0–2 in the new format.
2. Claude Code builds the notebook view, behind a switch, without touching SQL.
3. Raph tests Lessons 0–2.
4. If they're good, Claude converts Lessons 3–31, and Claude Code reruns all the answer tests.

Analyzely Python Course Plan
The big idea
Teach beginners to analyse data with pandas from lesson one. Learners pick up only the plain Python they need, when they need it. Same screen as the SQL course: editor, results table, hint ladder, gated progress.
What the research says (and what we copy)
• DataCamp (top-rated for beginners): short in-browser exercises, fast first win. Weakness: too much fill-in-the-blank, so learners freeze at a blank page.
• Dataquest: praised for typing real code from scratch and finishing with projects.
• Kaggle Learn: short, focused micro-lessons on real datasets.
• Learning science: worked examples first, then help that fades ("faded scaffolding"), immediate feedback, and "predict before you run" questions to make people think.
How every lesson works (5 tasks, help fades)
1. Watch: a worked example with hover explanations on each line (same as SQL).
2. Predict: "What will this print?" Pick an answer, then run it to check.
3. Fill in: the code is mostly written, and the learner types the missing piece.
4. Write with a starter: only the first line is given.
5. Write from scratch: a blank editor and a real question about the data.
What the learner sees on screen
• Left: lesson list, always visible, with the current lesson highlighted and a progress bar.
• Middle: a short explanation with key words in bold, then the task and the editor.
• Bottom or right: output. Tables show as a light spreadsheet-style grid, charts show as images, and print() text shows in a console box.
• Run button + Cmd+Enter. The table updates every time they run code, so they see their data change.
• Help ladder: hint 1, then hint 2, then example code with hover explanations. No skipping.
• Friendly errors: turn Python errors into plain words (for example, KeyError becomes "There's no column called 'Price'. Check the spelling and capital letters.").
Curriculum (22 lessons: 0 + 1–21)
Lesson 0: Tour
What Python and pandas are, how the screen works, and running your first line.
Level 1: Basics (dataset: games)
1. Variables, numbers, text and print()
2. Loading data: import pandas as pd, pd.read_csv(), df.head()
3. Looking at data: shape, columns, info(), describe()
4. Picking columns: df["col"] and df[["a", "b"]]
Level 2: Shaping (datasets: players, deliveries)
5. Filtering rows with one condition
6. Several conditions: &, |, isin()
7. Sorting: sort_values(), nlargest()
8. New columns, maths on columns, rename()
Level 3: Summarising
9. mean(), sum(), count(), value_counts()
10. groupby() with agg()
11. Missing values: isna(), dropna(), fillna()
12. Cleaning text and types: str.lower(), str.strip(), astype(), pd.to_datetime()
Level 4: Combining and charts (datasets: studios, sales)
13. Joining tables with merge()
14. Join types: inner vs left
15. Working with dates: dt.year, dt.month, grouping by month
16. Charts: df.plot() bar and line
17. pivot_table()
Level 5: Pro
18. Writing your own function (def) and apply()
19. if/else and for loops (and when you don't need them)
20. Method chaining: clean, readable analysis
21. Final case study: Campus Merch Shop (reuses the SQL case-study data, now as CSVs)
Folders (mirrors SQL exactly)
• lib/learn/python/LESSON_TEMPLATE.json: the lesson shape (I write it)
• lib/learn/python/lessons/lesson-00.json to lesson-21.json: lessons (I write them)
• lib/learn/python/datasets/*.csv: the datasets (I write them)
• lib/learn/python/runner.ts: runs Python in the browser (Claude Code builds it)
• lib/learn/languages.ts: add Python as a language (Claude Code)
Who does what
• Me (Claude chat): the template, all 22 lessons, the tasks, hints and datasets. You copy-paste them in.
• Claude Code: the machinery only: the Python runner, output display, answer checking, friendly errors and the new task types.
Problems and costs to know up front
1. Load time: Python in the browser (Pyodide) plus pandas is a big download, around 10–20 MB the first time. Fix: start loading in the background when the lesson list opens, show a friendly loading bar, and let the browser cache it so it's fast after that.
2. Freezing: an endless loop would freeze the page. Fix: run Python in a background worker with a time limit and a Stop button.
3. Checking answers: different code can give the same right answer. Fix: check the result (the table, number or printed text), not the exact code.
4. Phones: typing code on a phone is painful and Pyodide is slow there. Fix: it works on phones, but show a "best on a laptop" note.
5. Cost: Pyodide is free and open source, and it runs on the learner's device, so there's no server or AI cost.
6. Two new task types: "fill" (fill in the blank) needs a small new editor mode, and "chart" tasks need image output.
Order of work
1. Claude Code Step 0: report how the SQL engine plugs in and propose the Python version. Stop.
2. I write LESSON_TEMPLATE.json and Lesson 0 + Lesson 1 as a test.
3. Claude Code builds the runner and the screen, and tests with those two lessons.
4. You test on localhost (production build), commit, then I write lessons in batches of 4–5.
5. Push live after Level 1 works end to end.
Prompt for Claude Code (Step 0)
Read CLAUDE.md and LEARN_PLAN.md first. Make a new branch called python-course.
GOAL: add a Python (pandas) course to Learn, reusing the SQL course's machinery as much as possible. Lessons and datasets will be written by me in chat, not by you.
STEP 0: change nothing yet. Tell me in plain words:
1. How the SQL course plugs into the Learn engine (languages.ts, load-lessons.ts, lesson-types.ts, runner.ts, the editor and results grid), and what would need to change for a second language.
2. Your plan to run Python in the browser with Pyodide and pandas: inside a Web Worker, with a time limit, a Stop button, background preloading and a loading bar.
3. How you would show three kinds of output: tables (same light grid as SQL), charts (as images) and print() text.
4. How you would check answers by result, not by exact code.
5. What's needed for a new "fill" task type (fill in the blank).
6. Any costs, licences, size or phone problems.
Then create these empty folders only: lib/learn/python/lessons/ and lib/learn/python/datasets/. Stop and wait for my OK.