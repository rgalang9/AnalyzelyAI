Analyzely Pricing Plan
Status: built with Stripe in test mode. Limits live in lib/plans.ts. Switch to live keys when the site is ready for paying users.
Tiers

Free
Pro ($4.99/month)
Premium ($9.99/month)
Learn
Level 1 of every course (SQL, Python, Excel, R)
All lessons
All lessons
Daily Case
Today's case only
Today's case + last 30 days of past cases
Today's case + full archive with solutions
AI questions
10 per month (sign-in required)
50 per month
100 per month
AI data cleaning (per day, sign-in required)
5 per day
30 per day
60 per day
AI auto-titles (per day, sign-in required)
5 per day
30 per day
60 per day
File size
Up to 3,000 cells
Up to 10,000 cells
Up to 50,000 cells
Failed payments: users keep their paid plan while Stripe retries (past_due), and drop to Free when the subscription is canceled or unpaid.
Daily Case leaderboard: anyone signed in can compete on today's case. Guests can play but get no leaderboard spot.
Costs (estimates)
• One AI question costs about 2 cents if the app sends only column names and a few sample rows, not the whole file.
• Pro: about $1 of AI cost per month at full use. Premium: about $2.
• Stripe takes about 3% + 30 cents per payment.
• Vercel Pro ($20/month) is required before charging anyone, since Hobby forbids commercial use.
To do before launch
1. Check which features call the Claude API, and make cleaning (extra spaces, duplicates, blanks) plain code with no AI.
2. Trim what's sent to the AI (columns + sample rows, not the full file).
3. Upgrade Vercel to Pro.
4. Set an Anthropic monthly spend cap as a safety net.
5. Switch Stripe to live mode and add the live keys in Vercel.

Done
- Monthly AI question counters and file limits by plan.
- Stripe Checkout, webhook, Customer Portal, and each user's plan in Supabase.
- Upgrade pop-up: 3 boxes, Pro highlighted in the middle. No free trial.
- Lessons past Level 1 locked on the server for Free users.