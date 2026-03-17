export function buildOutreachDraftPrompt(input: {
  recruiterName?: string;
  company: string;
  roleTitle: string;
  userAngle: string;
}): string {
  return [
    "Generate a concise and professional recruiter outreach draft.",
    "Output should be personalized, not spammy, and ready for human review.",
    `Recruiter: ${input.recruiterName ?? "Hiring Team"}`,
    `Company: ${input.company}`,
    `Role: ${input.roleTitle}`,
    `User angle: ${input.userAngle}`,
  ].join("\n");
}
