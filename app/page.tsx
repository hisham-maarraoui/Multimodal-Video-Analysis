'use client';

import { useState, useRef, useEffect } from 'react';
import React from 'react';
import VideoSearch from '@/components/VideoSearch';
import Sections from '@/components/Sections';
import Transcript from '@/components/Transcript';
import Chat from '@/components/Chat';
import Skeleton from '@/components/Skeleton';
import { TranscriptCue } from '@/lib/types';

function decodeHtml(html: string) {
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

function getYouTubeId(url: string) {
  const match = url.match(/(?:v=|youtu.be\/)([\w-]{11})/);
  return match ? match[1] : '';
}

export default function Home() {
  const [videoUrl, setVideoUrl] = useState('');
  const [transcript, setTranscript] = useState<TranscriptCue[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasFetched, setHasFetched] = useState(false);
  const [sectionError, setSectionError] = useState('');
  const videoRef = useRef<HTMLIFrameElement>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchTranscript = async () => {
    setLoading(true);
    setChatHistory([]);
    setChatInput('');
    setChatLoading(false);
    setError('');
    setTranscript([]);
    setSections([]);
    setHasFetched(true);
    try {
      const res = await fetch('/api/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: videoUrl }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      setTranscript(data.transcript || []);
      // Now fetch sections from Gemini
      if (data.transcript && data.transcript.length > 0) {
        setSectionError('');
        const secRes = await fetch('/api/sections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: data.transcript }),
        });
        const secData = await secRes.json();
        if (secData.error) setSectionError(secData.error);
        setSections(secData.sections || []);
      }
    } catch (e) {
      setError('Failed to fetch transcript');
    }
    setLoading(false);
  };

  const seekTo = (seconds: number) => {
    const id = getYouTubeId(videoUrl);
    if (id && videoRef.current) {
      videoRef.current.src = `https://www.youtube.com/embed/${id}?start=${Math.floor(seconds)}&autoplay=1`;
    }
  };

  const videoId = getYouTubeId(videoUrl);

  async function handleChatSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || !videoId || !transcript.length) return;
    setChatLoading(true);
    setChatHistory(h => [...h, { role: 'user', content: chatInput }]);
    let answer = '';
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: chatInput,
          videoId,
          transcript,
        }),
      });
      if (!res.body) throw new Error('No response body');
      if (!res.ok) {
        // Try to parse error message
        let errMsg = 'Could not get answer.';
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch {}
        setChatHistory(h => [...h, { role: 'assistant', content: 'Error: ' + errMsg }]);
        setChatInput('');
        setChatLoading(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          answer += decoder.decode(value);
          setChatHistory(h => {
            const last = h[h.length - 1];
            if (last && last.role === 'assistant') {
              return [...h.slice(0, -1), { role: 'assistant', content: answer }];
            } else {
              return [...h, { role: 'assistant', content: answer }];
            }
          });
        }
      }
    } catch (err) {
      setChatHistory(h => [...h, { role: 'assistant', content: 'Error: Could not get answer.' }]);
    }
    setChatInput('');
    setChatLoading(false);
  }

  // Helper to format seconds as mm:ss or h:mm:ss
  function formatTimestamp(seconds: number): string {
    const sec = Math.floor(seconds % 60);
    const min = Math.floor((seconds / 60) % 60);
    const hr = Math.floor(seconds / 3600);
    if (hr > 0) {
      return `${hr}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    } else {
      return `${min}:${sec.toString().padStart(2, '0')}`;
    }
  }

  // Helper to highlight and link timestamps in chat answers
  function renderChatContent(content: string) {
    // Match [xx.xx s], [xx.xx s, yy.yy s], and [xx.xx s-yy.yy s]
    const regex = /\[(\d+\.?\d*)s(?:\s*[-,]\s*(\d+\.?\d*)s)*\]/g;
    const parts = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (match && match.index > lastIndex) {
        parts.push(content.slice(lastIndex, match.index));
      }
      // Collect all timestamps in the match
      const times: string[] = [];
      if (match) {
        if (match[1]) times.push(match[1]);
        // For [start-end] or [start, end, ...]
        let i = 2;
        while (match[i]) {
          times.push(match[i]);
          i++;
        }
      }
      times.forEach((t, i) => {
        if (i > 0) parts.push(', ');
        const sec = Number(t);
        parts.push(
          <button
            key={(match ? match.index : 0) + '-' + t}
            className="text-blue-400 underline hover:text-blue-300 mx-0.5"
            onClick={() => seekTo(sec)}
            title={`Jump to ${formatTimestamp(sec)}`}
          >
            [{formatTimestamp(sec)}]
          </button>
        );
      });
      lastIndex = match ? regex.lastIndex : lastIndex;
    }
    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex));
    }
    return parts;
  }

  return (
    <main className="min-h-screen bg-black text-white">
      {/* Full-page loading overlay */}
      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 mb-6"></div>
          <div className="text-2xl font-semibold">Analyzing video, please wait...</div>
        </div>
      )}
      <div className="max-w-5xl mx-auto py-8 px-4">
        <h1 className="text-4xl font-bold mb-4 text-center">Multimodal Video Analysis</h1>
        <p className="text-lg text-center mb-8">
          Enter a YouTube video URL to analyze its content with AI. This app fetches the transcript, generates a smart section breakdown, enables semantic chat, and lets you search for specific moments in the video using natural language queries. All results include clickable timestamps for easy navigation.
        </p>
        <div className="flex flex-col items-center mb-8">
          <form
            className="flex flex-col sm:flex-row items-center justify-center gap-2 mb-8 w-full max-w-xl"
            onSubmit={e => { e.preventDefault(); fetchTranscript(); }}
          >
            <input
              type="text"
              placeholder="Enter YouTube URL"
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              className="flex-1 max-w-md rounded-md px-4 py-2 bg-neutral-800 text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-400 text-center"
            />
            <button
              type="submit"
              disabled={loading || !videoUrl}
              className="rounded-md px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white font-semibold transition"
            >
              {loading ? 'Loading...' : 'Analyze Video'}
            </button>
          </form>
          {videoId && (
            <div className="mb-8 flex justify-center w-full">
              <iframe
                ref={videoRef}
                width="100%"
                height="315"
                src={`https://www.youtube.com/embed/${videoId}`}
                title="YouTube video player"
                frameBorder="0"
                allow="autoplay; encrypted-media"
                allowFullScreen
                className="rounded-lg w-full max-w-2xl aspect-video"
              />
            </div>
          )}
        </div>
        {/* Main content: Sections | Transcript | Chat */}
        {hasFetched && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_1.2fr_1.3fr_1.3fr] gap-4 h-[calc(100vh-200px)]">
            <div className="lg:col-span-1 min-w-0">
              {loading ? <Skeleton type="sections" /> : <Sections sections={sections} onSeek={seekTo} />}
            </div>
            <div className="lg:col-span-1 min-w-0">
              {loading ? <Skeleton type="transcript" /> : <Transcript transcript={transcript} onSeek={seekTo} />}
            </div>
            <div className="lg:col-span-1 min-w-0">
              {loading ? <Skeleton type="chat" /> : <Chat videoId={videoId} transcript={transcript} onSeek={seekTo} isDisabled={loading} />}
            </div>
            <div className="lg:col-span-1 min-w-[350px]">
              {loading ? <Skeleton type="search" /> : <VideoSearch videoUrl={videoUrl} onSeek={seekTo} />}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
