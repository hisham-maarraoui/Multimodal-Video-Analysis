import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export async function POST(req: NextRequest) {
  const { videoUrl, query } = await req.json();
  console.log({ videoUrl, query }); // Debug log

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    const prompt = `Given this YouTube video: ${videoUrl}
    Find all segments that match this query: "${query}"
    Respond ONLY with a valid JSON array of objects, no explanation or extra text. Each object must have:
    - startTime: timestamp in seconds (number)
    - endTime: timestamp in seconds (number)
    - description: brief description of what happens in this segment (string)
    Example: [{"startTime": 12.5, "endTime": 18.0, "description": "A red car appears"}]
    Output only valid JSON.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim();
    // Remove triple backticks and optional 'json' language tag
    if (text.startsWith('```')) {
      text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
    }
    let segments;
    try {
      segments = JSON.parse(text);
    } catch (err) {
      console.error('Video search JSON parse error:', err, 'LLM response:', text);
      return NextResponse.json({ error: 'The AI did not return valid JSON. Try rephrasing your query or try again.' }, { status: 500 });
    }
    return NextResponse.json({ segments });
  } catch (error) {
    console.error('Video search error:', error);
    return NextResponse.json(
      { error: 'Failed to search video', details: String(error) },
      { status: 500 }
    );
  }
} 