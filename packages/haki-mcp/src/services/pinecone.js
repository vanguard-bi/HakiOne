import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { PineconeStore } from "@langchain/pinecone";
import { config } from "../config.js";

let pineconeInstance = null;

export async function getPinecone() {
  if (!pineconeInstance) {
    pineconeInstance = new Pinecone({ apiKey: config.PINECONE_API_KEY });
  }
  return pineconeInstance;
}

export async function getVectorStore(client) {
  const pineconeIndex = client.Index(config.PINECONE_INDEX_NAME);
  return await PineconeStore.fromExistingIndex(
    new OpenAIEmbeddings({ openAIApiKey: config.OPENAI_API_KEY }),
    { pineconeIndex }
  );
}
