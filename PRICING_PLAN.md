Analyzely Pricing Plan
Status: planned. Apply once the site is ready for paying users.
Tiers

Free
Pro ($6/month)
Premium ($12/month)
Learn
Level 1 of every course (SQL, Python, R, more later)
All lessons
All lessons
Daily Case
Today's case only
Today's case + last 30 days of past cases
Today's case + full archive with solutions
AI questions
10 per month
50 per month
100 per month
File size
Up to 3,000 cells
Up to 50,000 cells
Up to 500,000 cells
Daily Case leaderboard: anyone signed in can compete on today's case. Guests can play but get no leaderboard spot.
Costs (estimates)
• One AI question costs about 2 cents if the app sends only column names and a few sample rows, not the whole file.
• Pro: about $1 of AI cost per month at full use. Premium: about $2.
• Stripe takes about 3% + 30 cents per payment.
• Vercel Pro ($20/month) is required before charging anyone, since Hobby forbids commercial use.
To do before launch
1. Check which features call the Claude API, and make cleaning (extra spaces, duplicates, blanks) plain code with no AI.
2. Trim what's sent to the AI (columns + sample rows, not the full file).
3. Add per-user monthly question counters and file-size limits by tier.
4. Set up Stripe Checkout and a Supabase column for each user's plan.
5. Build the pricing page: 3 boxes, Pro highlighted in the middle.
6. Upgrade Vercel to Pro.
7. Set an Anthropic monthly spend cap as a safety net.