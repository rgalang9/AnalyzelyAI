# Analyzely Excel Course Plan

Audience: students heading into finance and data jobs. Goal: be interview-ready in Excel (lookups, conditional sums, pivot tables, a simple financial model, and keyboard speed).

## How it's taught (format)

Research: Excel Exercises (reportedly about $30K/month), LogicExcel and Spreadsheet Center all use a simulated spreadsheet in the browser, where learners type real formulas and press real shortcuts. This "flight simulator" style is the proven format. Our edge: real story datasets, like the Daily Case, instead of tiny drills.

- **Layout:** task panel on the left, a real spreadsheet filling most of the screen on the right.
- **One task at a time:** e.g. "In D2, calculate revenue: price × quantity." Checked automatically by the cell's value (and the formula where it matters), turning green when correct.
- **One workbook per lesson:** tasks build on each other, so each lesson ends with something real (a report, a summary, a model).
- **Mouse allowed at first.** Shortcuts are added gradually, and the final level rewards keyboard-only speed.
- **Help ladder:** hint → highlight the cells to use → show the answer.

## Shortcut teaching

- **Windows/Mac picker:** auto-detected from the browser, with a switch the learner can change anytime. Formulas are the same on both; only shortcuts differ (e.g. F4 vs ⌘+T to lock references).
- **Fading key badges:** first time, big key badges on screen (⌘ + Shift + ↓) and they press along. Next time, just the action ("Jump to the bottom"), with the badge hidden behind a hint button. Later, no help.
- **Live key display:** a small corner box shows what they just pressed, so mistakes are visible instantly.
- **Browser conflicts:** some Excel shortcuts are taken by the browser (⌘+T new tab, Ctrl+W close tab, Ctrl+N new window). For those, show the real Excel key as info and teach a working in-app alternative.

## Tech

- **Univer** (open source, Apache 2.0, commercial use allowed): full Excel-style grid, formulas, keyboard controls, formatting. Free version includes number formatting, sorting, filtering, data validation and conditional formatting. Recheck the license before launch.
- **Pivot tables and charts:** free Univer doesn't have them (they're Univer Pro, paid). Use **PivotTable.js** (MIT) and **Chart.js** (MIT) instead, shown in a panel beside the grid. The learner picks the rows, values and chart type there. Cost: $0.
- **HyperFormula** (about 400 functions) as a backup formula engine. GPL licensed, so a paid site would likely need its commercial license.
- Lessons stored as JSON in `lib/learn/excel/lessons/` (format in `lib/learn/excel/LESSON_TEMPLATE.json`): id, level, title, explanation, workbook, tasks (teach, prompt, cell, expected, must_be_formula, function, formula_contains, selected, shortcut, hints, highlight, answer), recap.
- Our own shortcut map per OS in `lib/learn/excel/shortcuts.ts`.

## Curriculum (75 lessons, 11 levels, no cap)

Every lesson teaches one idea and uses one story workbook. Each level ends with a review lesson.

### Level 1: Spreadsheet basics (free, written)

0. Meet the grid: cells, rows, columns, ranges, the formula bar
1. Your first formulas: =, + - * /, order of operations
2. SUM, AVERAGE, MIN, MAX, COUNT
3. Copying formulas down: copy/paste, the fill handle, relative references
4. Locking cells with $: absolute references
5. Review: The Coffee Cart

### Level 2: Moving fast and editing

6. Jump to edges and select ranges with shortcuts
7. Editing like a pro: F2, Tab vs Enter, undo, inserting and deleting rows and columns
8. Paste Special: values only, transpose
9. Number formatting: currency, percent, decimals, dates
10. Conditional formatting: highlight high, low and duplicate values
11. Review: Tidying the intramural league sheet

### Level 3: Organizing data

12. Sorting, including sorting by two columns
13. Filtering
14. Tables (Ctrl+T) and table references
15. Freeze panes, hiding and grouping
16. Data validation: dropdown lists and input rules
17. Review: The concert ticket list

### Level 4: Text and cleaning

18. TRIM and CLEAN
19. UPPER, LOWER, PROPER
20. LEFT, RIGHT, MID, LEN
21. FIND and SEARCH, combined with LEFT/MID
22. SUBSTITUTE and REPLACE
23. Joining and splitting: &, TEXTJOIN, TEXTSPLIT
24. TEXT and removing duplicates
25. Review: The messy club sign-up sheet

### Level 5: Logic and conditional maths

26. Comparisons and TRUE/FALSE
27. IF
28. AND, OR, NOT
29. Nested IF, IFS, SWITCH
30. COUNTIF, SUMIF, AVERAGEIF
31. COUNTIFS, SUMIFS, AVERAGEIFS, MAXIFS, MINIFS
32. Reading errors and IFERROR
33. SUMPRODUCT
34. Review: The NBA stat sheet

### Level 6: Lookups

35. VLOOKUP (exact match)
36. Why VLOOKUP breaks, and approximate match (tax brackets)
37. XLOOKUP
38. XLOOKUP extras: if not found, search from the bottom
39. INDEX + MATCH
40. Two-way lookups
41. Named ranges
42. Review: The sneaker store

### Level 7: Dynamic arrays

43. Spilling and UNIQUE
44. SORT and SORTBY
45. FILTER
46. SEQUENCE and combining array functions
47. LET
48. Review: The streaming charts

### Level 8: Summaries and charts (side panel: PivotTable.js + Chart.js)

49. Pivot tables: the basics
50. Pivot tables: grouping, % of total, calculated fields
51. Slicers
52. Column and bar charts
53. Line and combo charts
54. Choosing the right chart, and sparklines
55. Review: The box office dashboard

### Level 9: Dates

56. Dates are numbers: DATE, YEAR, MONTH, DAY
57. TODAY, EDATE, EOMONTH
58. WORKDAY, NETWORKDAYS, DATEDIF
59. Month-by-month totals with SUMIFS on dates
60. Review: The gym membership log

### Level 10: Finance

61. Percent change and CAGR
62. Margins and unit economics
63. Time value of money: FV and PV
64. PMT and a loan payment table
65. NPV
66. IRR, XNPV, XIRR
67. Building a 3-year revenue model: inputs vs formulas
68. Scenarios: Goal Seek, data tables, sensitivity
69. Review: Should the food truck buy a second truck?

### Level 11: Pro skills

70. Checking formulas: trace precedents, show formulas
71. Model habits: blue inputs, black formulas, check cells
72. Speed round 1: keyboard only
73. Speed round 2: keyboard only
74. Final Case Study: a startup's revenue and profit model

### Still to check before writing Levels 2 to 11

- Whether free Univer supports Goal Seek, data tables, sparklines, slicers, dynamic arrays (FILTER, UNIQUE, SORT, LET), TEXTSPLIT and trace precedents. Anything it can't do gets built in the side panel, replaced, or cut.
- Cell-value checks can't grade formatting, sorting, filtering, dropdowns, pivots or charts. Each needs a new check type, built by Claude Code when we reach that level.
- Mac shortcut clash: locking a reference is ⌘+T on Mac Excel, which opens a new browser tab. Lesson 4 needs a working alternative.

## Monetization fit

Level 1 is free. Levels 2 to 11 need Pro or Premium (see PRICING_PLAN.md).

## Order of work

1. Claude Code installs Univer and builds the Excel lesson engine (layout, task checking, Windows/Mac switch, key badges, live key display). Done.
2. Claude writes Level 1 lessons as JSON. Raph tests them.
3. Before each new level, Claude Code adds any check types or side-panel tools it needs.
4. Claude writes Levels 2 to 11. Raph tests them.
5. Commit, merge to main, release.

## Also

- Remove Stata from the Learn page. Courses: SQL, Python, Excel, R (R after Excel, using webR in an RStudio-style layout).