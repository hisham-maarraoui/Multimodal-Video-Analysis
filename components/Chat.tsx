import React, { useState, useRef, useEffect } from 'react';
import { formatTimestamp } from '@/lib/utils';
import { TranscriptCue } from '@/lib/types';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatProps {
  videoId: string;
  transcript: TranscriptCue[];
  onSeek: (time: number) => void;
  isDisabled: boolean;
}

export default function Chat({ videoId, transcript, onSeek, isDisabled }: ChatProps) {
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset chat history when video changes
    setChatHistory([]);
  }, [videoId]);

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading || isDisabled) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMessage,
          videoId,
          transcript,
        }),
      });

      if (!response.ok) {
        let errorMsg = 'Failed to get response';
        try {
          const errJson = await response.json();
          errorMsg = errJson.error || errorMsg;
          if (errJson.details) errorMsg += `\nDetails: ${errJson.details}`;
        } catch {}
        throw new Error(errorMsg);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      let assistantMessage = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const text = new TextDecoder().decode(value);
        assistantMessage += text;
        
        setChatHistory(prev => {
          const newHistory = [...prev];
          const lastMessage = newHistory[newHistory.length - 1];
          if (lastMessage?.role === 'assistant') {
            lastMessage.content = assistantMessage;
          } else {
            newHistory.push({ role: 'assistant', content: assistantMessage });
          }
          return newHistory;
        });
      }
    } catch (error) {
      console.error('Chat error:', error);
      setChatHistory(prev => [
        ...prev,
        { role: 'assistant', content: error instanceof Error ? error.message : 'Sorry, I encountered an error. Please try again.' }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Updated: Match [123.45s], [h:mm:ss], and also ranges/lists like [23.68s-27.28s, 49.68s, 51.36s]
  const renderChatContent = (content: string) => {
    // Regex for [ ... ] with numbers, s, commas, dashes, and colons
    const regex = /\[((?:[\d:.]+s?(?:\s*[-,]\s*)?)+)\]/g;
    let lastIndex = 0;
    const parts: (string | React.ReactElement)[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(content.slice(lastIndex, match.index));
      }
      // Split by comma or dash, keep delimiters
      const inner = match[1];
      const matchIndex = match.index; // Store the index before forEach
      const tokens = inner.split(/(,|\-|–)/);
      tokens.forEach((token, i) => {
        const trimmed = token.trim();
        if (trimmed === ',' || trimmed === '-' || trimmed === '–') {
          parts.push(trimmed);
        } else if (trimmed) {
          let seconds = 0;
          if (trimmed.endsWith('s')) {
            seconds = parseFloat(trimmed.replace('s', ''));
          } else if (trimmed.includes(':')) {
            const timeParts = trimmed.split(':').map(Number);
            if (timeParts.length === 3) {
              seconds = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
            } else if (timeParts.length === 2) {
              seconds = timeParts[0] * 60 + timeParts[1];
            }
          } else if (!isNaN(Number(trimmed))) {
            seconds = Number(trimmed);
          }
          parts.push(
            <button
              key={matchIndex + '-' + i}
              className="text-blue-400 underline hover:text-blue-300 mx-0.5"
              onClick={() => onSeek(seconds)}
              title={`Jump to ${formatTimestamp(seconds)}`}
            >
              [{formatTimestamp(seconds)}]
            </button>
          );
        }
      });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex));
    }
    return parts;
  };

  return (
    <div className="h-full flex flex-col bg-white/5 backdrop-blur-sm rounded-lg p-4 px-6">
      <h2 className="text-xl font-semibold mb-4">Chat with Video</h2>
      <div className="flex-1 overflow-y-auto flex flex-col space-y-4">
        {chatHistory.map((msg, idx) => (
          <div
            key={idx}
            className={`p-3 rounded-lg ${
              msg.role === 'user'
                ? 'bg-blue-500/20 ml-12'
                : 'bg-white/10 mr-12'
            }`}
          >
            <div className="prose prose-invert max-w-none">
              {msg.role === 'assistant'
                ? renderChatContent(msg.content)
                : msg.content}
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
        <form onSubmit={handleChatSubmit} className="flex flex-col gap-2 w-full mt-4 bg-white/10 rounded-lg p-2">
          <input
            type="text"
            className="w-full rounded-md px-4 py-2 bg-white/10 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ask a question..."
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            disabled={chatLoading || isDisabled}
          />
          <button
            type="submit"
            disabled={chatLoading || !chatInput.trim() || isDisabled}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {chatLoading ? '...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
} 