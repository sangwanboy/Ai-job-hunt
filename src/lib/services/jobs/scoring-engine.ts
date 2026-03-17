export type ScoreInput = {
  titleSimilarity: number;
  skillsOverlap: number;
  locationFit: number;
  workModeFit: number;
  salaryFit: number;
  experienceFit: number;
  visaFit: number;
  companyPreferenceFit: number;
  urgency: number;
  postingFreshness: number;
  outreachPotential: number;
  completeness: number;
};

export type ScoreResult = {
  totalScore: number;
  confidence: number;
  explanation: string;
  factorBreakdown: Record<string, number>;
  anomalies: string[];
  missingInformationPenalty: number;
};

const weights: Record<keyof ScoreInput, number> = {
  titleSimilarity: 0.11,
  skillsOverlap: 0.18,
  locationFit: 0.08,
  workModeFit: 0.06,
  salaryFit: 0.1,
  experienceFit: 0.1,
  visaFit: 0.08,
  companyPreferenceFit: 0.07,
  urgency: 0.06,
  postingFreshness: 0.08,
  outreachPotential: 0.05,
  completeness: 0.03,
};

export function scoreJob(input: ScoreInput): ScoreResult {
  const factorBreakdown: Record<string, number> = {};
  let weightedSum = 0;
  let missingCount = 0;

  for (const [key, weight] of Object.entries(weights) as Array<[keyof ScoreInput, number]>) {
    const value = Number(input[key]);
    const normalized = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    if (!Number.isFinite(value)) {
      missingCount += 1;
    }
    factorBreakdown[key] = Number((normalized * 100).toFixed(1));
    weightedSum += normalized * weight;
  }

  const missingInformationPenalty = Number((missingCount * 2.5).toFixed(1));
  const rawScore = weightedSum * 100 - missingInformationPenalty;
  const totalScore = Math.max(0, Math.min(100, Number(rawScore.toFixed(1))));

  const anomalies: string[] = [];
  if (input.salaryFit < 0.2) {
    anomalies.push("Low salary fit");
  }
  if (input.completeness < 0.3) {
    anomalies.push("Incomplete posting data");
  }

  const confidence = Math.max(0.4, 1 - missingCount * 0.06);

  return {
    totalScore,
    confidence: Number(confidence.toFixed(2)),
    explanation: `Deterministic weighted score generated with ${missingCount} missing-factor penalties.`,
    factorBreakdown,
    anomalies,
    missingInformationPenalty,
  };
}
