import { getPinecone, getVectorStore } from "../services/pinecone.js";

export const SEARCH_TOOL_DEFINITION = {
  name: "haki_legal",
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

export async function handleSearch(args) {
  try {
    const query = args?.query;
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
    console.error("Error executing haki_legal:", error);
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
