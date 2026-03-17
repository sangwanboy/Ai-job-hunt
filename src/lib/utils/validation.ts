import { z } from "zod";

export const chatRequestSchema = z.object({
  agentId: z.string().min(1),
  sessionId: z.string().optional(),
  message: z.string().min(1).max(4000),
  context: z
    .object({
      jobId: z.string().optional(),
      recruiterId: z.string().optional(),
    })
    .optional(),
});

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
