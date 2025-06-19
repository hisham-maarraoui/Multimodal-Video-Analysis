import { Pinecone } from '@pinecone-database/pinecone';

const pineconeApiKey = process.env.PINECONE_API_KEY;
if (!pineconeApiKey) {
  throw new Error('Missing PINECONE_API_KEY in environment variables');
}

export const pinecone = new Pinecone({ apiKey: pineconeApiKey });

export function getPineconeIndex(indexName: string) {
  return pinecone.index(indexName);
} 