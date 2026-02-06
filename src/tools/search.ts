import { ToolModule } from './interface.js';

export const SearchTool: ToolModule = {
  name: "Web Search (Tavily)",
  configKeys: ["tavilyApiKey"],
  definition: {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for real-time information. Returns a summary of search results.",
      parameters: {
        type: "object",
        properties: {
          query: { 
            type: "string", 
            description: "The search query (e.g., 'latest openclaw news', 'nodejs documentation')." 
          },
          depth: {
            type: "string",
            enum: ["basic", "advanced"],
            description: "Search depth. 'basic' is faster, 'advanced' scrapes more content."
          }
        },
        required: ["query"]
      }
    }
  },
  handler: async (args: any, config: any) => {
    const apiKey = config.tavilyApiKey || process.env.TAVILY_API_KEY;
    
    if (!apiKey) {
      return "Error: Tavily API Key is missing. Please run 'autoclaw setup' to configure it, or set TAVILY_API_KEY env var. Get a free key at https://tavily.com";
    }

    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          api_key: apiKey,
          query: args.query,
          search_depth: args.depth || "basic",
          include_answer: true,
          include_images: false,
          max_results: 5
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        return `Search API Error: ${response.status} - ${errText}`;
      }

      const data: any = await response.json();
      
      // Format the results beautifully for the LLM
      let output = `Search Results for "${args.query}":

`;
      
      if (data.answer) {
        output += `💡 **Direct Answer**: ${data.answer}

`;
      }

      if (data.results && Array.isArray(data.results)) {
        data.results.forEach((result: any, index: number) => {
          output += `### ${index + 1}. ${result.title}
`;
          output += `🔗 ${result.url}
`;
          output += `📝 ${result.content}

`;
        });
      }

      return output;

    } catch (error: any) {
      return `Failed to perform web search: ${error.message}`;
    }
  }
};
