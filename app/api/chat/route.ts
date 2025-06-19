import { NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getCache, setCache } from '../utils/redis';
import { getPineconeIndex } from '../utils/pinecone';
import { embedTexts } from '../utils/embedding';

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const PINECONE_INDEX = process.env.PINECONE_INDEX || 'video-transcripts';

const GEMINI_MODELS = [
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-2.0-flash-exp',
];

function chunkTranscript(transcript: any[], chunkSize = 4) {
  // If transcript is very short, use chunkSize=1
  if (transcript.length > 0 && transcript.length < chunkSize) chunkSize = 1;
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

async function tryGeminiModels(prompt: string) {
  if (!GOOGLE_AI_API_KEY) throw new Error('Missing Google AI API key');
  for (const modelName of GEMINI_MODELS) {
    try {
      const genAI = new GoogleGenerativeAI(GOOGLE_AI_API_KEY);
      const model = genAI.getGenerativeModel({ model: modelName });
      const stream = await model.generateContentStream(prompt);
      return stream; // Success!
    } catch (err: any) {
      // Only try next model on rate limit or model-specific errors
      if (err?.status === 429 || err?.status === 403 || err?.status === 404) {
        continue;
      } else {
        throw err;
      }
    }
  }
  throw new Error('All Gemini models failed due to rate limiting or errors.');
}

export async function POST(req: NextRequest) {
  try {
    const { question, videoId, transcript } = await req.json();
    console.log('Received chat request:', { question, videoId, transcriptLength: transcript?.length });
    if (!question || !videoId || !transcript) {
      console.error('Missing required fields:', { question, videoId, transcript });
      return new Response(JSON.stringify({ error: 'Missing question, videoId, or transcript' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (!Array.isArray(transcript) || transcript.length === 0) {
      console.error('Transcript is empty or not an array:', { transcript });
      return new Response(JSON.stringify({ error: 'Transcript is empty or not available for this video.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 1. Check Redis for cached chunk metadata
    let chunks = await getCache(`chunks:${videoId}`);
    let chunkEmbeddings = await getCache(`embeddings:${videoId}`);

    if (!chunks || !chunkEmbeddings) {
      console.log('No cache found for videoId, chunking and embedding transcript.');
      chunks = chunkTranscript(transcript);
      console.log('Transcript chunks:', chunks);
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
      console.log('Upserted transcript chunks to Pinecone:', { count: chunks.length, videoId });
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
      console.warn('No relevant transcript context found for this video.', { videoId, question });
      return new Response(JSON.stringify({ error: 'No relevant transcript context found for this video. Try re-analyzing the video, asking a more specific question, or making sure the video has a transcript.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    // Instruct Google AI to respond in plain English only, no HTML or code
    const prompt = `You are an expert video assistant. Use the following transcript context to answer the user's question. Cite timestamps (e.g., [12.34s]) when relevant.\n\nContext:\n${context}\n\nQuestion: ${question}\nAnswer (plain English, no HTML or code):`;

    // 8. Stream Gemini response with fallback
    let stream;
    try {
      stream = await tryGeminiModels(prompt);
    } catch (err: any) {
      console.error('All Gemini models failed:', err);
      return new Response(JSON.stringify({ error: 'All Gemini models failed due to rate limiting or errors.', details: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

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
    return new Response(JSON.stringify({ error: 'RAG chat error', details: err?.message || String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
} 