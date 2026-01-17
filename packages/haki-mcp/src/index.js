import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { PineconeStore } from "@langchain/pinecone";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables from root .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../../.env") });

// --- Configuration & Env ---
const envSchema = z.object({
  OPENAI_API_KEY: z.string().trim().min(1),
  PINECONE_API_KEY: z.string().trim().min(1),
  PINECONE_INDEX_NAME: z.string().trim().min(1),
});

// Validate environment variables
let env;
try {
  env = envSchema.parse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    PINECONE_API_KEY: process.env.PINECONE_API_KEY,
    PINECONE_INDEX_NAME: process.env.PINECONE_INDEX_NAME,
  });
} catch (error) {
  console.error("Missing required environment variables:", error.errors);
  process.exit(1);
}

// --- Pinecone Singleton ---
let pineconeInstance = null;

async function getPinecone() {
  if (!pineconeInstance) {
    pineconeInstance = new Pinecone({ apiKey: env.PINECONE_API_KEY });
  }
  return pineconeInstance;
}

async function getVectorStore(client) {
  const pineconeIndex = client.Index(env.PINECONE_INDEX_NAME);
  return await PineconeStore.fromExistingIndex(
    new OpenAIEmbeddings({ openAIApiKey: env.OPENAI_API_KEY }),
    { pineconeIndex }
  );
}

// --- MCP Server Setup ---
const server = new Server(
  {
    name: "haki-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define Tools
const SEARCH_TOOL = {
  name: "search_case_law",
  description:
    "Search for Kenyan case law and rulings. Use this to find relevant legal precedents and statutes.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The legal query or topic to search for.",
      },
    },
    required: ["query"],
  },
};

// Handle List Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [SEARCH_TOOL],
  };
});

// Handle Call Tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "search_case_law") {
    try {
      const query = request.params.arguments?.query;
      if (!query || typeof query !== "string") {
        throw new Error("Invalid query argument");
      }

      const pineconeClient = await getPinecone();
      const vectorStore = await getVectorStore(pineconeClient);
      const retriever = vectorStore.asRetriever();

      // Retrieve documents
      const docs = await retriever.invoke(query);

      // Format results
      const content = docs
        .map(
          (doc, i) =>
            `--- Source ${i + 1} ---\n${doc.pageContent}\nMetadata: ${JSON.stringify(
              doc.metadata
            )}`
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: content || "No relevant case law found.",
          },
        ],
      };
    } catch (error) {
      console.error("Error executing search_case_law:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error searching case law: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Tool not found: ${request.params.name}`);
});

// Start Server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Haki MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main:", error);
  process.exit(1);
});
