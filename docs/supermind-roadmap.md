# Triad Supermind — Architecture & Phased Roadmap

> Goal: turn the Triad admin portal into an AI-driven operations brain that links each
> project to its GitHub repo, plans work around the hours we actually have, and pushes us
> to **land projects and earn money**. The AI ("supermind") is **autonomous** — it can
> read and write to the portal on its own, within guardrails.

---

## 1. What we already have (foundation)

The portal is in good shape to build on — most of the data model already exists.

| Capability | Status | Where |
|---|---|---|
| Next.js 15 + React 19 + TypeScript | ✅ | `admin/` |
| Supabase (Postgres + Auth + Storage) | ✅ | `admin/supabase/migrations/` (up to `0021`) |
| Projects (status, priority, owner, customer, dates) | ✅ | `projects` table |
| Project external URL field | ✅ | `0008_project_external_url.sql` |
| Tasks (multi-assignee, subtasks, status, priority, due) | ✅ | `tasks` table |
| Customers (prospect → active → closed) | ✅ | `customers` table |
| Offers (project price + monthly SaaS, VAT, numbering) | ✅ | `0015`–`0020` |
| Finance (expenses, income, invoices, cashflow) | ✅ | `0014_finance_economy.sql` |
| Meetings (agenda, participants, action items) | ✅ | `meetings` table |
| Invite-only auth + RLS (`is_member()`) | ✅ | `0001`, `0021`, `middleware.ts` |

**Gaps to fill:** no AI integration, no GitHub link, no time-estimate/capacity fields, no
planner view. None require re-architecting — all additive.

---

## 2. Target architecture

```
                         ┌─────────────────────────────────┐
                         │         Triad Admin (Next.js)    │
                         │  /admin/supermind  (chat + plan) │
                         └──────────────┬──────────────────┘
                                        │
                  ┌─────────────────────┼─────────────────────┐
                  │                     │                     │
        ┌─────────▼────────┐  ┌─────────▼────────┐  ┌─────────▼────────┐
        │  Supabase (DB)   │  │  Claude API      │  │  GitHub App      │
        │  projects/tasks/ │  │  (tool use,      │  │  repos, commits, │
        │  customers/offers│◄─┤   autonomous)    ├─►│  PRs, issues, CI │
        │  ai_threads/runs │  │                  │  │                  │
        └──────────────────┘  └──────────────────┘  └──────────────────┘
```

**Core idea:** Claude is wired to the portal through **tools** (function calling). Each tool
is a typed function that reads or writes Supabase / GitHub. The supermind doesn't get raw
DB access — it gets a curated set of safe tools, every call logged.

### Where the AI runs
- **Claude API** via `@anthropic-ai/sdk`, called from **Next.js API routes** (or Supabase
  Edge Functions for scheduled/background runs).
- Model: **Claude Opus** for planning/reasoning, **Haiku** for cheap routine classification
  (e.g. "is this customer cold?").
- **Prompt caching** on the system prompt + portal schema to keep cost down.

---

## 3. The "supermind" — what it does

Three modes, all backed by the same tool set:

**A. Daily driver (interactive)**
> "What should I work on today? I have 6 hours."
The supermind reads open tasks, deadlines, customer stage, offer status, GitHub activity,
and your weekly capacity → returns a prioritized, time-boxed plan ranked by revenue impact.

**B. Autonomous background runs (scheduled)**
Runs on a cron (Supabase scheduled function or Vercel cron). Each run can, on its own:
- Create/triage tasks from new meeting action items.
- Flag stalled projects (no commits + no tasks moved in N days).
- Flag cold customers (prospect with no contact in N days) and draft a follow-up.
- Draft offers for customers that hit "ready to quote" stage.
- Post a daily/weekly briefing.

**C. Revenue focus (the money engine)**
Every plan is scored against money signals already in the DB:
- Customers near `closed` / with an open offer → highest priority.
- Projects with an active offer but stalled delivery → risk to revenue.
- Idle capacity → suggest outreach/sales tasks, not just delivery work.

---

## 4. Autonomy & guardrails (since it acts on its own)

Autonomous ≠ unbounded. The design:

- **Allowlisted tools only.** The AI can call `create_task`, `update_task`,
  `draft_offer`, `update_customer_stage`, `post_briefing`, etc. It **cannot** delete data,
  send external email, or move money without a human gate.
- **Tiered actions:**
  - *Green (auto)* — create/triage tasks, status flags, internal briefings, drafts.
  - *Yellow (auto + reversible + notify)* — change project/customer stage, reprioritize.
  - *Red (always human-confirm)* — send anything to a customer, finalize/send an offer,
    anything financial, anything destructive.
- **Full audit log.** Every tool call → `ai_runs` / `ai_actions` rows: input, output,
  which tool, reversible y/n. One screen to review and undo.
- **Kill switch.** A single `ai_enabled` company setting halts all autonomous runs.
- **Spend cap.** Daily token budget; stop when hit.

---

## 5. Data model changes (new migrations)

Additive only. Next free numbers start at `0022`.

```sql
-- 0022_github_link.sql
alter table projects
  add column github_owner text,
  add column github_repo  text,
  add column github_installation_id bigint;
-- optional cache table: project_repo_activity (commits/PRs/issues snapshot)

-- 0023_task_estimates_capacity.sql
alter table tasks add column estimate_hours numeric;
create table member_capacity (
  profile_id uuid references profiles(id),
  weekly_hours numeric not null default 0,
  primary key (profile_id)
);

-- 0024_supermind.sql
create table ai_threads ( id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id), title text, created_at timestamptz default now() );
create table ai_messages ( id uuid primary key default gen_random_uuid(),
  thread_id uuid references ai_threads(id), role text, content jsonb, created_at timestamptz default now() );
create table ai_runs ( id uuid primary key default gen_random_uuid(),
  kind text, status text, summary text, tokens int, created_at timestamptz default now() );
create table ai_actions ( id uuid primary key default gen_random_uuid(),
  run_id uuid references ai_runs(id), tool text, args jsonb, result jsonb,
  tier text, reversible bool, undone bool default false, created_at timestamptz default now() );

-- 0025_company_ai_settings.sql
alter table company_settings
  add column ai_enabled bool default false,
  add column ai_daily_token_cap int default 200000;
```

All new tables guarded by the existing `is_member()` RLS pattern.

---

## 6. GitHub integration

- Register one **GitHub App** for the Triad org (not personal tokens) — install it on the
  repos you want linked.
- Store `installation_id` per project. Use it to mint short-lived tokens server-side.
- Read: recent commits, open/merged PRs, open issues, latest CI status.
- Surface on the project page as a live "delivery health" panel → feeds the supermind's
  stalled-project detection.
- (Later) Let the supermind open GitHub issues from portal tasks, two-way.

---

## 7. Phased delivery plan

Sequenced so each phase ships something usable and de-risks the next.

### Phase 0 — Plan & decisions (this doc) ✅
Architecture agreed, autonomy model agreed.

### Phase 1 — Foundations (data + GitHub) ✅ DONE
- ✅ Migrations `0022`–`0025` (GitHub link, estimates+capacity, AI tables, AI settings).
- ✅ Per-project repo linking (`owner/repo` field in Projektinfo).
- ✅ "Leveranshälsa" panel on the project page (commits/PRs/issues/CI), via
  `src/lib/github.ts` + `ProjectRepoHealth.tsx`, lazy-loaded in Suspense.
- ✅ Capacity settings (weekly hours per person) in Inställningar + `estimate_hours`
  field on tasks.
- **To activate:** (1) run migrations `0022`–`0025` in the Supabase SQL editor;
  (2) set `GITHUB_TOKEN` env (fine-grained PAT, read-only: Contents, Issues, Pull
  requests, Actions, Metadata) in Vercel.
- *Note:* used a token in env (works with a PAT now, GitHub App installation token
  later) instead of a full GitHub App, to ship value without blocking on App registration.

### Phase 2 — Supermind core (advisor, read-only first) ✅ DONE
- ✅ Claude API wired in (`@anthropic-ai/sdk`, `claude-opus-4-8`, adaptive thinking +
  `effort: high`, prompt caching on the frozen system prompt + tools).
- ✅ **Read-only tool set** over Supabase (`src/lib/supermind/tools.ts`): projects, tasks,
  customers, offers, finance summary, meetings, capacity — all run with the member's
  authenticated client so RLS applies.
- ✅ Manual agentic loop (`src/lib/supermind/agent.ts`) that logs every run to `ai_runs`
  and every tool call to `ai_actions` — the audit trail Phase 3's autonomy builds on.
- ✅ `/admin/supermind` chat UI with thread history + quick-start prompts; `Supermind` in
  the sidebar. API at `src/app/admin/api/supermind/route.ts`.
- ✅ "Plan my week by available hours" + revenue-ranked priorities baked into the system
  prompt.
- **To activate:** set `ANTHROPIC_API_KEY` in Vercel (migrations `0024` must be run, as in
  Phase 1, for thread/run/action persistence).
- *Note:* read-only by design — validates the AI's reasoning before Phase 3 grants writes
  + autonomy.

### Phase 3 — Write tools + autonomy · ~3–4 days
- Add green/yellow write tools (`create_task`, `triage`, `flag`, `draft_offer`…).
- `ai_runs` / `ai_actions` audit log + review/undo screen.
- Kill switch + token cap.
- Scheduled background run (daily briefing + triage).

### Phase 4 — Money engine & polish · ~2–3 days
- Revenue scoring across customers/offers/projects.
- Cold-customer + stalled-project detection with drafted follow-ups (red = human-send).
- Weekly "what made/will make us money" briefing.

> Total rough estimate: **~2–3 focused weeks**. Phases 1 and 2 are independently valuable
> even if we stop there.

---

## 8. Cost & keys (what we'll need)

- **Anthropic API key** (set as `ANTHROPIC_API_KEY` env var in Vercel + Supabase).
- **GitHub App** credentials (app id, private key, webhook secret).
- Token cost is controllable: prompt caching + Haiku for routine work + daily cap. Expect
  low single-digit dollars/day for a 3-person team's planning load.

---

## 9. Open questions for later

1. Should background runs post briefings to **Slack/email**, or just in-portal? (External =
   needs that integration; in-portal is zero extra setup.)
2. Two-way GitHub (portal task ↔ GitHub issue) — phase 4 or later?
3. Per-person AI plans, or one shared team plan? (Capacity model supports both.)

---

*Status: Phases 1 & 2 implemented & build-verified. Next step on approval: Phase 3 (write tools + autonomy).*
