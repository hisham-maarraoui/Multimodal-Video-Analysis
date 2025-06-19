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

    console.log('Available languages:', transcriptData.languages);
    console.log('Available tracks:', transcriptData.tracks.length);

    // Find the best transcript track with language preference
    let selectedTrack = null;
    let selectedLanguage = null;
    
    // Priority 1: Look for English tracks (en, en-US, en-GB, etc.)
    for (const track of transcriptData.tracks) {
      const langCode = track.language?.toLowerCase() || '';
      if (langCode.includes('english') || langCode.startsWith('en')) {
        selectedTrack = track;
        selectedLanguage = transcriptData.languages.find((lang: any) => 
          lang.languageCode.toLowerCase().startsWith('en') || 
          lang.label.toLowerCase().includes('english')
        );
        console.log('Selected English track:', track.language);
        break;
      }
    }
    
    // Priority 2: If no English track, use the first available track
    if (!selectedTrack && transcriptData.tracks.length > 0) {
      selectedTrack = transcriptData.tracks[0];
      selectedLanguage = transcriptData.languages[0];
      console.log('No English track found, using first available:', selectedTrack.language);
    }

    if (!selectedTrack || !selectedTrack.transcript || selectedTrack.transcript.length === 0) {
      return NextResponse.json({ error: 'No transcript content available' }, { status: 404 });
    }

    // Convert the transcript data to the expected format
    const cues: TranscriptCue[] = selectedTrack.transcript.map((item: any) => {
      const start = parseFloat(item.start);
      const duration = parseFloat(item.dur);
      return {
        text: item.text,
        start: start,
        end: start + duration,
      };
    });

    console.log(`Successfully extracted ${cues.length} transcript cues in ${selectedLanguage?.label || 'unknown language'}`);

    return NextResponse.json({ 
      transcript: cues,
      videoId,
      source: 'youtube-transcript-api',
      language: selectedLanguage?.label || 'Unknown',
      languageCode: selectedLanguage?.languageCode || 'unknown',
      title: transcriptData.title,
      availableLanguages: transcriptData.languages,
      isEnglish: selectedLanguage?.languageCode?.toLowerCase().startsWith('en') || false
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