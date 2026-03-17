import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "founder@example.com" },
    update: {},
    create: {
      email: "founder@example.com",
      name: "SaaS Founder",
      preferences: {
        create: {
          preferredLocations: ["London", "Remote"],
          preferredWorkModes: ["REMOTE", "HYBRID"],
          preferredSeniority: ["SENIOR", "STAFF", "LEAD"],
          preferredTone: "direct and strategic",
          preferredCommunication: "concise",
        },
      },
    },
  });

  const linkedinSource = await prisma.jobSource.upsert({
    where: { key: "linkedin_alerts" },
    update: {},
    create: {
      key: "linkedin_alerts",
      label: "LinkedIn Alerts",
      adapterType: "email_alert",
    },
  });

  const csvSource = await prisma.jobSource.upsert({
    where: { key: "csv_import" },
    update: {},
    create: {
      key: "csv_import",
      label: "CSV Import",
      adapterType: "csv",
    },
  });

  const companyA = await prisma.company.upsert({
    where: { name_website: { name: "Northstar AI", website: "https://northstar.example" } },
    update: {},
    create: {
      name: "Northstar AI",
      website: "https://northstar.example",
      country: "UK",
      industry: "SaaS",
      sizeBand: "51-200",
    },
  });

  const recruiter = await prisma.recruiter.create({
    data: {
      userId: user.id,
      companyId: companyA.id,
      fullName: "Amelia Grant",
      email: "amelia.grant@northstar.example",
      linkedinUrl: "https://linkedin.com/in/amelia-grant",
      relationship: "Warm",
    },
  });

  const job1 = await prisma.job.create({
    data: {
      userId: user.id,
      sourceId: linkedinSource.id,
      source: "linkedin",
      sourceUrl: "https://linkedin.com/jobs/view/1",
      externalId: "ln-1",
      title: "Senior Full-Stack Engineer",
      companyId: companyA.id,
      recruiterId: recruiter.id,
      location: "London",
      country: "UK",
      workMode: "HYBRID",
      salaryMin: 90000,
      salaryMax: 120000,
      currency: "GBP",
      descriptionRaw: "Build internal AI products and customer-facing dashboard experiences.",
      descriptionClean: "Build AI-assisted dashboards, own TypeScript services, and collaborate with product.",
      requiredSkills: ["TypeScript", "React", "Node.js", "SQL"],
      preferredSkills: ["Prisma", "Redis", "LLMs"],
      applicationStatus: "SAVED",
      priority: "HIGH",
      aiSummary: "Strong match for SaaS and agent tooling experience.",
    },
  });

  await prisma.job.create({
    data: {
      userId: user.id,
      sourceId: csvSource.id,
      source: "csv",
      sourceUrl: "",
      externalId: "csv-22",
      title: "AI Product Engineer",
      companyId: companyA.id,
      location: "Remote",
      country: "UK",
      workMode: "REMOTE",
      salaryMin: 85000,
      salaryMax: 115000,
      currency: "GBP",
      descriptionRaw: "Ship LLM workflows and customer-facing features quickly.",
      descriptionClean: "Lead AI feature delivery, evaluate prompts, and improve customer outcomes.",
      requiredSkills: ["Prompt Engineering", "TypeScript", "Product Thinking"],
      preferredSkills: ["OpenAI", "Analytics", "B2B SaaS"],
      applicationStatus: "NEW",
      priority: "MEDIUM",
    },
  });

  await prisma.jobScore.create({
    data: {
      jobId: job1.id,
      userId: user.id,
      totalScore: 82,
      confidence: 0.86,
      explanation: "High skills overlap and strong salary/location fit.",
      factorBreakdown: {
        titleSimilarity: 0.88,
        skillsOverlap: 0.85,
        locationFit: 0.7,
        salaryFit: 0.9,
        postingFreshness: 0.75,
      },
      anomalies: [],
      missingDataPenalty: 3,
    },
  });

  const scout = await prisma.agent.create({
    data: {
      userId: user.id,
      key: "job_scout",
      onboardingCompleted: true,
      desiredHelpMode: "Prioritize best-fit roles and explain why",
      personalityStyle: "Analytical and direct",
      soul: {
        create: {
          mission: "Find and prioritize high-probability opportunities.",
          longTermObjective: "Help user maximize interview conversion.",
          principles: ["Be evidence-based", "Avoid noisy recommendations"],
          toneBoundaries: ["professional", "constructive"],
          decisionPhilosophy: "Use deterministic score first, LLM explanation second.",
          valuesRules: ["No spam outreach", "Human approval required before send"],
        },
      },
      identity: {
        create: {
          name: "Atlas",
          roleTitle: "Job Scout Agent",
          specialization: "Opportunity ranking",
          communicationStyle: "Concise, strategic",
          expertiseProfile: ["Market scanning", "Prioritization", "Scoring interpretation"],
          strengths: ["Pattern detection", "Signal over noise"],
          cautionAreas: ["Cannot guarantee hiring outcomes"],
          outputFormat: "Bulleted action list with score rationale",
          description: "A pragmatic scout that spots roles worth immediate effort.",
        },
      },
      mindConfig: {
        create: {
          provider: "OPENAI",
          model: "gpt-4.1-mini",
          systemPromptTemplate: "You are Atlas, a high-precision job scouting agent.",
          constraints: ["Never automate platform abuse", "Always provide reasoning"],
          deterministicMode: true,
          maxTurns: 10,
          cooldownMs: 750,
        },
      },
      memoryProfile: {
        create: {
          retrievalTopK: 10,
          summaryWindow: 12,
          staleDays: 30,
          compressionThreshold: 24,
        },
      },
      onboardingProfile: {
        create: {
          desiredName: "Atlas",
          desiredHelp: "Rank jobs and suggest next actions",
          desiredStyle: "Strategic and concise",
          rememberNotes: "Prefers UK remote/hybrid senior roles and direct communication.",
        },
      },
      personalityTraits: {
        create: [
          { traitKey: "conciseness", value: 0.72, confidence: 0.78 },
          { traitKey: "strategic_depth", value: 0.68, confidence: 0.75 },
          { traitKey: "warmth", value: 0.45, confidence: 0.61 },
        ],
      },
      loopRules: {
        create: [
          { ruleKey: "repeat_goal", description: "Block repeated goals within short window", threshold: 2, cooldownMs: 60000 },
          { ruleKey: "repeat_tool", description: "Prevent repeated tool calls for same payload", threshold: 2, cooldownMs: 30000 },
        ],
      },
      toolPermissions: {
        create: [
          { toolName: "jobs.search", accessLevel: "read" },
          { toolName: "jobs.score", accessLevel: "read" },
          { toolName: "outreach.draft", accessLevel: "write" },
        ],
      },
    },
  });

  const session = await prisma.chatSession.create({
    data: {
      userId: user.id,
      agentId: scout.id,
      title: "First planning session",
      messages: {
        create: [
          {
            role: "ASSISTANT",
            content: "Before we begin, what would you like to call me?",
            tokenEstimate: 13,
          },
          {
            role: "USER",
            content: "Call you Atlas. Help me focus on UK remote senior platform roles.",
            tokenEstimate: 16,
          },
          {
            role: "ASSISTANT",
            content: "Locked in. I will prioritize high-fit UK remote/hybrid senior roles and explain each recommendation.",
            tokenEstimate: 22,
          },
        ],
      },
    },
  });

  await prisma.agentSummaryMemory.create({
    data: {
      agentId: scout.id,
      sessionId: session.id,
      summary: "User named agent Atlas and requested strategic concise support for UK remote/hybrid senior roles.",
      sourceMessageCount: 3,
      tokenSavedEstimate: 48,
    },
  });

  await prisma.agentMemoryChunk.create({
    data: {
      agentId: scout.id,
      userId: user.id,
      kind: "LONG_TERM",
      content: "User preference: direct communication, UK focus, remote/hybrid senior roles.",
      summary: "User style and role preferences",
      importanceScore: 0.92,
      tokenEstimate: 22,
      metadata: {
        source: "onboarding",
      },
    },
  });

  console.log("Seed complete");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
