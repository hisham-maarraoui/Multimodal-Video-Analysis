import { NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getCache, setCache } from '../utils/redis';
import { getPineconeIndex } from '../utils/pinecone';
import { embedTexts } from '../utils/embedding';

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const PINECONE_INDEX = process.env.PINECONE_INDEX || 'video-transcripts';

function chunkTranscript(transcript: any[], chunkSize = 4) {
  // Group transcript into chunks of N lines
  const chunks = [];
  for (let i = 0; i < transcript.length; i += chunkSize) {
    const group = transcript.slice(i, i + chunkSize);
    const text = group.map((item: any) => `[${item.start?.toFixed(2)}s] ${item.text}`).join(' ');
    chunks.push({
      text,
      start: group[0]?.start || 0,
      end: group[group.length - 1]?.start || 0,
    });
  }
  return chunks;
}

export async function POST(req: NextRequest) {
  try {
    const { question, videoId, transcript } = await req.json();
    console.log({ question, videoId, transcript }); // Debug log
    if (!question || !videoId || !transcript) {
      return new Response('Missing question, videoId, or transcript', { status: 400 });
    }

    // 1. Check Redis for cached chunk metadata
    let chunks = await getCache(`chunks:${videoId}`);
    let chunkEmbeddings = await getCache(`embeddings:${videoId}`);

    if (!chunks || !chunkEmbeddings) {
      // 2. Chunk and embed transcript
      chunks = chunkTranscript(transcript);
      chunkEmbeddings = await embedTexts(chunks.map((c: any) => c.text));
      // 3. Upsert to Pinecone
      const index = getPineconeIndex(PINECONE_INDEX);
      await index.upsert(
        chunks.map((chunk: any, i: number) => ({
          id: `${videoId}-chunk-${i}`,
          values: chunkEmbeddings[i],
          metadata: { text: chunk.text, start: chunk.start, end: chunk.end, videoId },
        }))
      );
      // 4. Cache in Redis
      await setCache(`chunks:${videoId}`, chunks);
      await setCache(`embeddings:${videoId}`, chunkEmbeddings);
    }

    // 5. Embed the question
    const [questionEmbedding] = await embedTexts([question]);
    // 6. Query Pinecone for top-5 relevant chunks
    const index = getPineconeIndex(PINECONE_INDEX);
    const queryRes = await index.query({
      topK: 5,
      vector: questionEmbedding,
      includeMetadata: true,
      filter: { videoId },
    });
    console.log('Pinecone query results:', queryRes);
    const retrieved = queryRes.matches?.map((m: any) => m.metadata) || [];
    // 7. Build context prompt
    const context = retrieved.map((c: any) => c.text).join('\n');
    console.log('Context sent to Google AI:', context);
    if (!context.trim()) {
      return new Response(JSON.stringify({ error: 'No relevant transcript context found for this video. Try re-analyzing the video, asking a more specific question, or making sure the video has a transcript.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    // Instruct Google AI to respond in plain English only, no HTML or code
    const prompt = `You are an expert video assistant. Use the following transcript context to answer the user's question. Cite timestamps (e.g., [12.34s]) when relevant.\n\nContext:\n${context}\n\nQuestion: ${question}\nAnswer (plain English, no HTML or code):`;

    // 8. Stream Google AI response
    if (!GOOGLE_AI_API_KEY) {
      return new Response('Missing Google AI API key', { status: 500 });
    }
    const genAI = new GoogleGenerativeAI(GOOGLE_AI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const stream = await model.generateContentStream(prompt);

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream.stream) {
          controller.enqueue(encoder.encode(chunk.text()));
        }
        controller.close();
      },
    });
    return new Response(readable, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (err: any) {
    console.error('RAG chat error:', err);
    return new Response(JSON.stringify({ error: 'RAG chat error: ' + (err?.message || String(err)) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
} 