# Why we built the harness, in plain language

*For anyone curious about how we get more out of AI coding tools, technical or not. Ten minutes.*

## The short version

When you ask an AI coding tool like Claude Code to do something, by default one model does everything: it reads your project, plans the change, writes the code, checks its own work, and tells you it is done. That is like hiring one brilliant architect and also making them drive the van, measure every wall, hang the drywall, and inspect their own work. It works, but it is slow, it is expensive, and nobody is checking the person who says "it's finished".

The harness changes who does what. One strong model plans and makes the decisions. Many cheap, fast models do the legwork in parallel. A second strong model is paid to try to break the result. The best model we can access signs off once, at the end. And nothing is allowed to say "done" without showing the test it ran.

That is the whole idea. The rest of this document explains why it is faster, cheaper and more trustworthy, and what it does not do.

## What a "harness" is

The model is the brain. The harness is everything around the brain: who gets asked what, who checks whom, which jobs go to the expensive specialist and which to the quick helper, and what has to be true before anyone is allowed to declare victory.

Good harnesses are why two teams with the same AI model get very different results. The model is a commodity now; the system you build around it is the product. Anthropic says the same thing about their newest small model: it is "built for subagents". The vendors are designing for this way of working, and the harness is us using it on purpose.

## Meet the crew

Every role below is a real, separate AI worker with its own instructions, its own tools, and its own model. The analogies are only to make the roles easy to remember.

**The orchestrator** is the senior person who holds the plan. It talks to you, decides what needs doing, hands out the work, and keeps the big picture in its head. It runs on Claude Opus 5.5, a top-tier model, because planning and judgment are where the expensive brain pays for itself.

**The scouts** are interns with a flashlight. They search the codebase or the web and come back with exact locations and quotes, nothing else. They run on Claude Haiku 5.5, the cheapest and fastest model, because finding things is mechanical work and the result is easy to verify. Several scouts can run at the same time.

**The builders** are reliable carpenters working from a written spec. Each one gets one well-defined piece of the job, its own copy of the project to work in, and a list of what "done" means. They run on Claude Sonnet 5.5, the mid-tier model: strong enough to write good code when the brief is clear, a fifth of the price of the senior model. Several builders work in parallel.

**The refuters** are the colleagues whose job is to break your work before a customer does. For every piece a builder finishes, three refuters each attack it from a different angle: does it do what was asked, what happens at the edges, and did anyone actually run the tests. They run on Opus 5.5 at high effort, because finding a subtle bug is judgment work. A piece only passes when the refuters cannot break it.

**The judge** is the senior engineer whose name goes on the release. It is called once, at the very end, with all the evidence already gathered, and it says PASS or FAIL with reasons. It runs on Claude Fable 5.1, the most capable model available to us and also the most expensive, which is exactly why it is used once rather than everywhere.

**The smoke detector** is a tiny, almost free check that runs every time the AI finishes a turn in which it changed files. It asks four yes/no questions: did it claim the work is done, did it show the check it ran, is there still an error mentioned, is it leaving a step to the human. If the answers look like "done, trust me", it sends the AI back once to run the checks. This uses a new kind of model (TypeSafe's Jev, or OpenAI's Decisions API) that does not write text at all; it only answers bounded questions, in a tenth of a second, for a fraction of a cent.

**The outside auditor** is a reviewer from a different company's model family (OpenAI's GPT) that you can call in for changes that matter. Two models from the same family tend to share the same blind spots. A reviewer trained by someone else fails differently, and that is the point.

## Why it is faster

The default way of working is one model doing one thing at a time. The harness fans out: five scouts search at once, four builders build at once, twelve refuters review at once. The wall-clock time of a job becomes the time of its slowest piece, not the sum of all pieces. Claude Code's "dynamic workflows" feature exists to run exactly this kind of fan-out, and the harness ships three ready-made workflows (ship, review, audit) that use it.

## Why it is cheaper

Prices per million tokens, as published by Anthropic in September and October 2026 (input / output):

| Model | Price | Used for |
|---|---|---|
| Haiku 5.5 | $0.10 / $0.50 | search, reading, summaries |
| Sonnet 5.5 | $2 / $10 | implementation from a spec |
| Opus 5.5 | $4 / $20 | planning, decisions, trying to break things |
| Fable 5.1 | $10 / $50 | the final verdict |

Haiku is forty times cheaper than Opus. Most of the tokens in a coding task are reading, not thinking: scanning files, running tests, paging through logs. When all of that runs on the expensive model you pay the expensive price for intern work.

An illustration, not a measurement. Say a mid-sized change needs about 3 million tokens of reading and searching, 1 million tokens of writing code, 500 thousand tokens of review, and 100 thousand tokens for the final verdict. Done entirely on Opus, the reading alone is the bulk of the bill. In the harness the reading goes to Haiku, the writing to Sonnet, the review stays on Opus, and the verdict goes to Fable. The total number of tokens goes up a little, because more agents means more coordination. The bill goes down a lot, because the expensive tokens are now only the ones that need to be expensive. The exact saving depends on your mix of work; the direction does not.

The one rule that makes this safe is "route by verifiability, not by difficulty". If a cheap model's output can be checked mechanically (did it find the right file, did the test pass), it is safe to use the cheap model. If a wrong answer would quietly propagate (a design decision, a judgment call), it goes to the expensive one.

## Why it is more trustworthy

Three habits are built in, so nobody has to remember them.

Nothing is done until it is verified. Builders must run the checks that apply to what they touched and report the command and the result. The smoke detector catches the cases where that did not happen.

Every change gets attacked before it is accepted. Refuters are not asked "is this good?", which invites a polite yes. They are told to break it, with evidence, and they only concede after trying. Findings from refuters are then verified by another refuter before they reach you, so you are not flooded with false alarms either.

The final word belongs to the strongest model, used sparingly. One high-quality verdict at the end costs less than a dozen mediocre ones along the way, and it is the one a human actually reads before merging.

## What it does not do

It does not remove the need for a clear request. The planner can only split a task well if the task is understandable. "Make it better" produces a worse plan than "add rate limiting to the public API, 100 requests per minute per key, return 429 with a Retry-After header".

It does not make the cheap model smart. Haiku is excellent at finding and summarising, and weak at judgment. The harness never asks it to judge. If you push judgment work onto the scouts yourself, you will get cheap wrong answers.

It does not make a single run cheaper in tokens. A workflow with twenty agents uses more tokens than one chat turn. It is cheaper per unit of verified, finished work, and it is much faster. On a monthly subscription, large workflows draw on your usage limits; start with a small task to see the shape of it.

It does not replace the human review before a merge. The judge's PASS is a strong signal, not a merge button. Read the summary, skim the diff, decide.

The smoke detector can be wrong. It is calibrated to be cautious and it fails open: if it is unsure, or the service is down, it does nothing. Its only power is to send the AI back once to run the checks it should have run anyway.

## Where the ideas come from

Anthropic's own guidance: Haiku 5.5 "pairs well with Opus 5.5 and Sonnet 5.5 as a subagent on coding work"; their dynamic workflows feature runs "tens to hundreds of parallel subagents" with "adversarial agents working to break the result before you see it"; Fable 5.1 is positioned for the hardest, longest tasks at the highest price. Practitioners sharing their setups publicly, in particular the "route by verifiability" ladder (local or Haiku for mechanical work, Sonnet in the middle, Opus driving, Fable as the occasional advisor). And the arrival in September 2026 of decision-only models (TypeSafe's Jev, then OpenAI's Decisions API) that make a near-free, near-instant "is this really done?" check possible for the first time.

## Glossary

**Model**: the AI brain. Different sizes cost different amounts and are good at different things.
**Token**: the unit AI usage is billed in; roughly three quarters of a word.
**Subagent**: a separate AI worker with its own instructions, tools and model, started by the main one for a specific job.
**Workflow**: a script that runs many subagents in a fixed order, in parallel where possible, and checks their results against each other.
**Worktree**: a separate copy of the project folder so several builders can edit files at the same time without stepping on each other.
**Hook**: a small program that runs automatically at a given moment (for example when the AI wants to finish) and can let it continue or send it back.
**Gate**: a check that must pass before work is accepted.
**Decision model**: a model that answers only bounded questions (yes/no, pick one, score from 1 to 5) with a probability, extremely fast and cheap, and cannot write text.
