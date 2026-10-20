import Anthropic from "@anthropic-ai/sdk";

// Friendly messages for AI problems, shared by every route that calls Claude

export const MISSING_KEY_MESSAGE =
  "The AI isn't set up yet — add your ANTHROPIC_API_KEY to .env.local and restart the app.";

export function aiErrorMessage(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return "The AI key doesn't seem to be valid. Double-check ANTHROPIC_API_KEY in .env.local.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "The AI is a little busy right now. Please wait a moment and try again.";
  }
  if (error instanceof Anthropic.BadRequestError && /credit/i.test(error.message)) {
    return "Your Anthropic account is out of credits. Add some at platform.claude.com and try again.";
  }
  return "Something went wrong reaching the AI. Please try again in a moment.";
}
