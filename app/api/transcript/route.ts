import { NextRequest, NextResponse } from 'next/server';
import { YoutubeTranscript } from 'youtube-transcript';

// You can use a package like 'youtube-transcript' or call an external API here.
// For demo, we'll return a static transcript.

// Helper to decode basic HTML entities
function decodeHtml(html) {
  return html
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export async function POST(req: NextRequest) {
  const { url } = await req.json();

  try {
    // Always fetch the English transcript
    const transcript = await YoutubeTranscript.fetchTranscript(url, { lang: 'en' });
    // Map 'offset' to 'start' for frontend compatibility
    const mapped = transcript.map((item: any) => ({
      ...item,
      start: typeof item.offset === 'number' ? item.offset : 0,
      text: decodeHtml(item.text),
    }));
    console.log('Transcript result:', mapped);
    return NextResponse.json({ transcript: mapped });
  } catch (error) {
    console.error('Transcript fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch transcript', details: String(error) }, { status: 500 });
  }
} 