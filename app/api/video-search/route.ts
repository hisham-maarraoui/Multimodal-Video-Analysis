import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { extractFrames, downloadYouTubeVideo } from '@/lib/imageRag';
import { embedImageWithPython, embedTextWithPython } from '@/lib/clipPython';
import { getPineconeIndex } from '../utils/pinecone';
import fs from 'fs';
import path from 'path';

const GEMINI_MODELS = [
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-2.0-flash-exp',
];

async function tryGeminiModels(prompt: string) {
  for (const modelName of GEMINI_MODELS) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      return result;
    } catch (err: any) {
      if (err?.status === 429 || err?.status === 403 || err?.status === 404) {
        continue;
      } else {
        throw err;
      }
    }
  }
  throw new Error('All Gemini models failed due to rate limiting or errors.');
}

async function imageRagSearch(videoId: string, videoPath: string, query: string) {
  // 1. Extract frames (if not already done)
  const framesDir = path.join('/tmp', `frames_${videoId}`);
  if (!fs.existsSync(framesDir) || fs.readdirSync(framesDir).length === 0) {
    await extractFrames(videoPath, framesDir, 1); // 1 fps
  }
  let framePaths = fs.readdirSync(framesDir)
    .filter(f => f.endsWith('.jpg'))
    .map(f => path.join(framesDir, f))
    .slice(0, 10); // Strictly limit to 10 frames in the chain
  console.log('Embedding N frames:', framePaths.length, framePaths);
  const embeddings = await Promise.all(framePaths.map(embedImageWithPython));
  console.log('Frame embeddings count:', embeddings.length);
  const index = getPineconeIndex('video-frames');
  console.log('Upserting', embeddings.length, 'vectors to Pinecone');
  await index.upsert(
    embeddings.map((vec, i) => ({
      id: `${videoId}-frame-${i}`,
      values: Array.from(vec),
      metadata: { framePath: framePaths[i], videoId, timestamp: i },
    }))
  );

  // 3. Embed query
  const queryEmbedding = await embedTextWithPython(query);
  // 4. Query Pinecone for top frames
  const queryRes = await index.query({
    topK: 5,
    vector: Array.from(queryEmbedding),
    includeMetadata: true,
    filter: { videoId },
  });
  console.log('Pinecone image query results:', queryRes);
  const results = queryRes.matches?.map(m => m.metadata) || [];
  return results;
}

export async function POST(req: NextRequest) {
  const { videoUrl, query, forceImageRag } = await req.json();
  console.log('Received video search request:', { videoUrl, query, forceImageRag });

  // If forceImageRag is true, skip Gemini and run only image RAG
  if (forceImageRag) {
    try {
      const videoId = videoUrl.match(/(?:v=|youtu.be\/)([\w-]{11})/)?.[1] || 'video';
      const videoPath = `/tmp/${videoId}.mp4`;
      if (!fs.existsSync(videoPath)) {
        await downloadYouTubeVideo(videoUrl, videoPath);
        console.log('Downloaded video to', videoPath);
      }
      // Increase frame extraction rate to 3 fps
      const framesDir = path.join('/tmp', `frames_${videoId}`);
      if (!fs.existsSync(framesDir) || fs.readdirSync(framesDir).length === 0) {
        await extractFrames(videoPath, framesDir, 3); // 3 fps
      }
      const framePaths = fs.readdirSync(framesDir)
        .filter(f => f.endsWith('.jpg'))
        .map(f => path.join(framesDir, f));
      console.log('Extracted frame paths:', framePaths);
      const embeddings = await Promise.all(framePaths.map(embedImageWithPython));
      console.log('Frame embeddings count:', embeddings.length);
      const index = getPineconeIndex('video-frames');
      await index.upsert(
        embeddings.map((vec, i) => ({
          id: `${videoId}-frame-${i}`,
          values: Array.from(vec),
          metadata: { framePath: framePaths[i], videoId, timestamp: i },
        }))
      );
      const queryEmbedding = await embedTextWithPython(query);
      const queryRes = await index.query({
        topK: 5,
        vector: Array.from(queryEmbedding),
        includeMetadata: true,
        filter: { videoId },
      });
      console.log('Pinecone image query results:', queryRes);
      const results = (queryRes.matches || []).map(m => ({
        ...m.metadata,
        score: m.score,
      }));
      console.log('Image RAG results:', results);
      return NextResponse.json({ segments: results, source: 'image-rag' });
    } catch (err) {
      console.error('Image RAG error:', err);
      return NextResponse.json({ error: 'Image RAG error', details: String(err) }, { status: 500 });
    }
  }

  // 1. Try Gemini video understanding API (text+image)
  try {
    const prompt = `Given this YouTube video: ${videoUrl}
    Find all segments that match this query: "${query}"
    Respond ONLY with a valid JSON array of objects, no explanation or extra text. Each object must have:
    - startTime: timestamp in seconds (number)
    - endTime: timestamp in seconds (number)
    - description: brief description of what happens in this segment (string)
    If there are no matches, return an empty array: []
    Output only valid JSON.`;
    let result;
    try {
      result = await tryGeminiModels(prompt);
    } catch (err) {
      console.error('All Gemini models failed:', err);
      result = null;
    }
    if (result) {
      const response = await result.response;
      let text = response.text().trim();
      console.log('Gemini raw response:', text);
      if (text.startsWith('```')) {
        text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
      }
      try {
        const segments = JSON.parse(text);
        if (Array.isArray(segments) && segments.length > 0) {
          console.log('Gemini parsed segments:', segments);
          return NextResponse.json({ segments, source: 'gemini' });
        }
      } catch (err) {
        console.warn('Failed to parse Gemini response as JSON:', text, err);
        // fall through to image RAG
      }
    }
  } catch (err) {
    console.error('Gemini video search error:', err);
    // fall through to image RAG
  }

  // 2. Fallback: Custom image RAG pipeline
  try {
    // Download video to /tmp
    const videoId = videoUrl.match(/(?:v=|youtu.be\/)([\w-]{11})/)?.[1] || 'video';
    const videoPath = `/tmp/${videoId}.mp4`;
    if (!fs.existsSync(videoPath)) {
      await downloadYouTubeVideo(videoUrl, videoPath);
      console.log('Downloaded video to', videoPath);
    }
    const results = await imageRagSearch(videoId, videoPath, query);
    console.log('Image RAG results:', results);
    return NextResponse.json({ segments: results, source: 'image-rag' });
  } catch (err) {
    console.error('Image RAG error:', err);
    return NextResponse.json({ error: 'Image RAG error', details: String(err) }, { status: 500 });
  }
} 