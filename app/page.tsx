'use client';

import { useState, useRef, useEffect } from 'react';
import React from 'react';

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
  const [transcript, setTranscript] = useState<any[]>([]);
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

  // Scroll to bottom on new chat message
  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

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
        parts.push(
          <button
            key={(match ? match.index : 0) + '-' + t}
            className="text-blue-400 underline hover:text-blue-300 mx-0.5"
            onClick={() => seekTo(Number(t))}
            title={`Jump to ${t}s`}
          >
            [{t}s]
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
    <main className="min-h-screen bg-gradient-to-br from-neutral-900 via-neutral-950 to-blue-950 text-white flex flex-col items-center justify-center px-2 py-8">
      <div className="w-full max-w-4xl flex flex-col items-center justify-center min-h-[60vh]">
        <h1 className="text-3xl font-bold mb-2 text-center">Multimodal Video Analysis</h1>
        <p className="text-center text-neutral-300 mb-8 max-w-2xl mx-auto">
          Enter a YouTube video URL to unlock multimodal video analysis. This app fetches the transcript, generates a smart section breakdown, and enables semantic chat and timestamp navigation—all powered by Google AI. The chat uses Retrieval-Augmented Generation (RAG) for more accurate, context-aware answers from the video content.
        </p>
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
        {/* Main content: Sections | Transcript | Chat */}
        {hasFetched && (
          <div className="flex flex-col lg:flex-row gap-2 w-full justify-center items-stretch">
            {/* Sections (left) */}
            <div className="flex-1 max-w-xs min-w-0 bg-neutral-800 rounded-l-lg p-6 shadow-lg min-h-[200px] border-r border-neutral-700">
              <h3 className="text-lg font-semibold mb-4">Sections</h3>
              {loading ? (
                <ul className="space-y-4 animate-pulse">
                  {[...Array(3)].map((_, i) => (
                    <li key={i} className="h-8 bg-neutral-700 rounded w-3/4 mx-auto" />
                  ))}
                </ul>
              ) : sections.length > 0 ? (
                <ul className="space-y-4">
                  {sections.map((section, idx) => (
                    <li key={idx}>
                      <button
                        className="text-blue-400 hover:underline font-bold text-base"
                        onClick={() => seekTo(section.start)}
                        title={`Jump to ${section.start}s`}
                      >
                        [{section.start}s] {decodeHtml(section.title)}
                      </button>
                      <div className="text-neutral-300 text-sm mt-1 ml-6">{decodeHtml(section.summary)}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-neutral-400">{sectionError ? sectionError : (hasFetched && !loading ? 'No sections available.' : '')}</div>
              )}
            </div>
            {/* Transcript (center) */}
            <div className="flex-1 min-w-0 bg-neutral-800 p-6 shadow-lg h-full min-h-[200px] border-r border-neutral-700 flex flex-col">
              <h2 className="text-lg font-semibold mb-4">Transcript</h2>
              {error && <div className="text-red-400 mb-2">{error}</div>}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <ul className="space-y-2 animate-pulse">
                    {[...Array(6)].map((_, i) => (
                      <li key={i} className="h-5 bg-neutral-700 rounded w-full" />
                    ))}
                  </ul>
                ) : (sections.length > 0 && transcript.length > 0) ? (
                  <ul className="space-y-2">
                    {transcript.map((item, idx) =>
                      typeof item.start === 'number' && item.text ? (
                        <li key={idx} className="flex items-start gap-2">
                          <button
                            className="text-blue-400 hover:underline font-mono text-sm min-w-fit"
                            onClick={() => seekTo(item.start)}
                            title={`Jump to ${item.start.toFixed(2)}s`}
                          >
                            [{item.start.toFixed(2)}s]
                          </button>
                          <span className="text-neutral-100 text-sm">{decodeHtml(item.text)}</span>
                        </li>
                      ) : null
                    )}
                  </ul>
                ) : (
                  <div className="text-neutral-400">{videoUrl && !loading && hasFetched ? 'No transcript available.' : ''}</div>
                )}
              </div>
            </div>
            {/* Chat (right) */}
            {videoId && transcript.length > 0 && (
              <div className="flex-1 max-w-xl min-w-0 bg-neutral-800 rounded-r-lg p-6 shadow-lg flex flex-col">
                <h3 className="text-lg font-semibold mb-4">Chat with the Video</h3>
                <form onSubmit={handleChatSubmit} className="flex gap-2 w-full items-stretch mb-4">
                  <input
                    type="text"
                    className="flex-1 rounded-md px-4 py-2 bg-neutral-700 text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="Ask a question..."
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    disabled={chatLoading}
                  />
                  <button
                    type="submit"
                    disabled={chatLoading || !chatInput.trim()}
                    className="rounded-md px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white font-semibold transition"
                    style={{ minWidth: 80 }}
                  >
                    {chatLoading ? '...' : 'Send'}
                  </button>
                </form>
                <div className="space-y-2 flex-1 overflow-y-auto">
                  {chatHistory.length === 0 && (
                    <div className="text-neutral-400">Ask a question about the video transcript or its content.</div>
                  )}
                  {chatHistory.map((msg, idx) => (
                    <div key={idx} className={msg.role === 'user' ? 'text-blue-300 text-right' : 'text-green-300 text-left'}>
                      <span className="whitespace-pre-line">{msg.role === 'assistant' ? renderChatContent(msg.content) : msg.content}</span>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
