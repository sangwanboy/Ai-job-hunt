# AI Job Intelligence & Outreach Dashboard

Production-minded SaaS starter for job intelligence, scoring, outreach drafts, and stateful agent chat.

## Included in This Foundation

- Next.js App Router + TypeScript + Tailwind shell
- Sidebar/top nav + dashboard/jobs/agent workspace pages
- Prisma schema with core job entities and full agent architecture entities
- Seed script with distinct sample agent profile and onboarding memory
- Deterministic scoring engine starter
- AI provider abstraction starter (OpenAI/Anthropic/Gemini ready)
- Agent registry, onboarding manager, prompt composer, loop prevention, token budget, and memory compaction starters
- XLSX export starter endpoint
- Centralized env validation, logging, and request validation

## Quickstart

1. Install Node.js 20+ and npm.
2. Install dependencies:

```bash
npm install
```

3. Copy environment values:

```bash
cp .env.example .env
```

4. Run Prisma generate/migrate/seed:

```bash
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run prisma:seed
```

5. Start dev server:

```bash
npm run dev
```

## Initial Routes

- `/dashboard` overview widgets and trend chart
- `/jobs` jobs intelligence table
- `/agents/workspace` onboarding-first chat starter
- `/api/agents/chat` conversation orchestration API
- `/api/exports/jobs` XLSX export starter

## Notes

- Current AI provider implementation uses mock responses behind provider abstraction.
- Auth is intentionally boundary-ready and will be wired in next phase.
- Queue architecture is Redis/BullMQ-ready but synchronous for this foundation step.
