import { NextRequest, NextResponse } from 'next/server';
import { TranscriptCue } from '@/lib/types';

// Import the youtube-transcript-api package
const TranscriptClient = require('youtube-transcript-api');

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Extract video ID from YouTube URL
    const videoId = extractVideoId(url);
    if (!videoId) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    console.log('Fetching transcript for video ID:', videoId);

    // Initialize the transcript client
    const client = new TranscriptClient();
    await client.ready;

    // Fetch transcript using youtube-transcript-api package
    const transcriptData = await client.getTranscript(videoId);
    
    if (!transcriptData || !transcriptData.tracks || transcriptData.tracks.length === 0) {
      return NextResponse.json({ error: 'No transcript available for this video' }, { status: 404 });
    }

    // Get the first available transcript track
    const firstTrack = transcriptData.tracks[0];
    if (!firstTrack.transcript || firstTrack.transcript.length === 0) {
      return NextResponse.json({ error: 'No transcript content available' }, { status: 404 });
    }

    // Convert the transcript data to the expected format
    const cues: TranscriptCue[] = firstTrack.transcript.map((item: any) => {
      const start = parseFloat(item.start);
      const duration = parseFloat(item.dur);
      return {
        text: item.text,
        start: start,
        end: start + duration,
      };
    });

    console.log(`Successfully extracted ${cues.length} transcript cues`);

    return NextResponse.json({ 
      transcript: cues,
      videoId,
      source: 'youtube-transcript-api',
      language: firstTrack.language,
      title: transcriptData.title
    });

  } catch (error: any) {
    console.error('Error fetching transcript:', error);
    
    // Handle specific youtube-transcript-api errors
    if (error.message?.includes('Transcript is disabled')) {
      return NextResponse.json({ 
        error: 'Transcript is disabled for this video' 
      }, { status: 404 });
    }
    
    if (error.message?.includes('No transcript found')) {
      return NextResponse.json({ 
        error: 'No transcript available for this video' 
      }, { status: 404 });
    }

    return NextResponse.json({ 
      error: 'Failed to fetch transcript',
      details: error.message 
    }, { status: 500 });
  }
}

function extractVideoId(url: string): string | null {
  // Handle different YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/ // Direct video ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
} 