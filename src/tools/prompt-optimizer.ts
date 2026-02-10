import OpenAI from 'openai';
import { ToolModule } from './interface.js';

export const PromptOptimizerTool: ToolModule = {
  name: "Prompt Optimizer",
  definition: {
    type: "function",
    function: {
      name: "optimize_prompt",
      description: "Optimize a user's raw task description or prompt to be more professional, structured, and effective. STRONGLY RECOMMENDED for creative tasks (like image generation) or complex scripts to ensure high-quality results.",
      parameters: {
        type: "object",
        properties: {
          raw_prompt: { 
            type: "string", 
            description: "The original, raw prompt or task description provided by the user." 
          },
          context: { 
            type: "string", 
            description: "Optional context about the goal, audience, or specific requirements (e.g., 'for an image generator', 'for a code reviewer')." 
          }
        },
        required: ["raw_prompt"]
      }
    }
  },
  handler: async (args: any, config: any) => {
    if (!config?.apiKey) {
      return "Error: OpenAI API Key is missing in the configuration. Please run 'autoclaw setup' or check your .env file.";
    }

    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl
    });

    const contextMsg = args.context ? `Context: ${args.context}` : "Context: General AI Assistant interaction.";

    try {
      const completion = await client.chat.completions.create({
        model: config.model || 'gpt-4o',
        messages: [
          {
            role: "system",
            content: `You are an expert Prompt Engineer. Your goal is to rewrite the user's raw prompt to be clear, precise, and highly effective for LLMs or professional communication.
            
RULES:
1. Preserve the original intent.
2. Structure the prompt logically (e.g., Role, Context, Task, Constraints, Output Format).
3. Use professional and concise language.
4. Return ONLY the optimized prompt. Do not add conversational filler.`
          },
          {
            role: "user",
            content: `Raw Prompt: "${args.raw_prompt}"

${contextMsg}

Please optimize this prompt.`
          }
        ]
      });

      return completion.choices[0].message?.content || "Error: Failed to generate optimized prompt.";
    } catch (error: any) {
      return `Error optimizing prompt: ${error.message}`;
    }
  }
};
