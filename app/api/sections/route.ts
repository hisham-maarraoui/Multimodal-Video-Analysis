import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { TranscriptCue } from '@/lib/types';

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;

export async function POST(req: NextRequest) {
  if (!GOOGLE_AI_API_KEY) {
    return NextResponse.json({ error: 'Missing Google AI API key' }, { status: 500 });
  }

  const { transcript } = await req.json();
  if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
    return NextResponse.json({ error: 'Transcript is required' }, { status: 400 });
  }

  // Prepare the transcript as a single string for Google AI
  const transcriptText = transcript
    .map((item: TranscriptCue) => `[${item.start?.toFixed(2)}s] ${item.text}`)
    .join('\n');

  const prompt = `Given the following video transcript, break it down into clear sections. For each section, provide:
- A short title
- A summary (1-2 sentences)
- The start timestamp (in seconds) for the section

Transcript:
${transcriptText}

Return the result as a JSON array of objects with keys: title, summary, start.`;

  try {
    const genAI = new GoogleGenerativeAI(GOOGLE_AI_API_KEY);
    // Use the Google AI Flash model for potentially higher quota or different capabilities.
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    // Try to extract JSON from the response
    const jsonStart = text.indexOf('[');
    const jsonEnd = text.lastIndexOf(']') + 1;
    let sections = [];
    if (jsonStart !== -1 && jsonEnd !== -1) {
      try {
        sections = JSON.parse(text.slice(jsonStart, jsonEnd));
      } catch (e: unknown) {
        return NextResponse.json({ error: 'Failed to parse Google AI response', details: text }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: 'No JSON found in Google AI response', details: text }, { status: 500 });
    }
    return NextResponse.json({ sections });
  } catch (error) {
    return NextResponse.json({ error: 'Google AI API error', details: String(error) }, { status: 500 });
  }
} 