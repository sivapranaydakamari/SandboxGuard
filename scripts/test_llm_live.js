import "dotenv/config";
import OpenAI from "openai";

async function main() {
  console.log("=== LLM Live Integration Probe ===");
  console.log("Base URL:", process.env.LLM_BASE_URL || "https://api.openai.com/v1");
  console.log("Configured Model:", process.env.LLM_MODEL);

  const client = new OpenAI({
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.LLM_BASE_URL || "https://api.openai.com/v1"
  });

  console.log("Step 1: Testing minimal chat completion request...");
  const completion = await client.chat.completions.create({
    model: process.env.LLM_MODEL,
    messages: [
      { role: "system", content: "You are a concise test assistant." },
      { role: "user", content: "Reply with the word 'PONG'." }
    ],
    max_tokens: 10
  });

  const reply = completion.choices[0]?.message?.content?.trim();
  console.log("Step 1 Success! Model reply:", reply);
  console.log("Token usage:", completion.usage);

  console.log("Step 2: Testing tool-calling capability with run_shell...");
  const toolCompletion = await client.chat.completions.create({
    model: process.env.LLM_MODEL,
    messages: [
      { role: "system", content: "You are an agent. When asked to inspect a file, call run_shell." },
      { role: "user", content: "Inspect package.json using cat" }
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "run_shell",
          description: "Execute command in sandbox",
          parameters: {
            type: "object",
            properties: {
              command: { type: "string" }
            },
            required: ["command"]
          }
        }
      }
    ],
    tool_choice: "auto"
  });

  const toolCalls = toolCompletion.choices[0]?.message?.tool_calls;
  console.log("Step 2 Tool calls returned:", JSON.stringify(toolCalls));
  if (toolCalls && toolCalls.length > 0) {
    console.log("Step 2 Success! Tool calling is fully supported by this model.");
  } else {
    console.log("Model did not emit a tool call; text reply:", toolCompletion.choices[0]?.message?.content);
  }
}

main().catch((err) => {
  console.error("LLM Live Test Failed:", err.status || "", err.message || err);
  process.exit(1);
});
