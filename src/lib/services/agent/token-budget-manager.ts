export class TokenBudgetManager {
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  checkResponseBudget(input: { message: string; budget: number }): { allowed: boolean; warning?: string } {
    const estimate = this.estimateTokens(input.message);
    if (estimate > input.budget) {
      return {
        allowed: false,
        warning: `Estimated ${estimate} tokens exceeds response budget ${input.budget}.`,
      };
    }
    if (estimate > input.budget * 0.8) {
      return {
        allowed: true,
        warning: `High token usage expected (${estimate}/${input.budget}).`,
      };
    }
    return { allowed: true };
  }
}

export const tokenBudgetManager = new TokenBudgetManager();
