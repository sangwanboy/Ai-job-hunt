export function buildJobSummaryPrompt(descriptionRaw: string): string {
  return [
    "You are a job intelligence assistant.",
    "Clean and summarize the job posting in under 120 words.",
    "Highlight responsibilities, required skills, and signal quality.",
    `Job description: ${descriptionRaw}`,
  ].join("\n");
}
