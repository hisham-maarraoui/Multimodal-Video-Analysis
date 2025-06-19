import { useState } from 'react';
import { formatTime } from '@/lib/utils';

interface Segment {
  startTime: number;
  endTime: number;
  description: string;
}

interface VideoSearchProps {
  videoUrl: string;
  onSeek: (time: number) => void;
}

export default function VideoSearch({ videoUrl, onSeek }: VideoSearchProps) {
  const [query, setQuery] = useState('');
  const [segments, setSegments] = useState<Segment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/video-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl, query, forceImageRag: false }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to search video');
      }
      
      setSegments(data.segments);
      setSource(data.source || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setSource(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white/5 backdrop-blur-sm rounded-lg p-4 px-2">
      <div className="mb-4">
        <h2 className="text-xl font-semibold mb-2">Video Search</h2>
        <div className="flex flex-col gap-2 w-full">
          <input
            type="text"
            placeholder="Search for moments in the video"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full min-w-[260px] rounded-md px-4 py-2 bg-white/10 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button
            onClick={handleSearch}
            disabled={isLoading}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-red-500 mb-4 p-2 bg-red-500/10 rounded-lg">
          {error}
        </div>
      )}

      {source && (
        <div className="text-xs text-gray-400 mb-2">
          Results source: <span className="font-mono">{source === 'gemini' ? 'AI (semantic search)' : 'CLIP (visual search)'}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {segments.length > 0 ? (
          <div className="space-y-3">
            {segments.map((segment, index) => (
              <div
                key={index}
                className="p-3 bg-white/5 rounded-lg hover:bg-white/10 cursor-pointer"
                onClick={() => onSeek(segment.startTime)}
              >
                <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
                  <span>{formatTime(segment.startTime)}</span>
                  <span>→</span>
                  <span>{formatTime(segment.endTime)}</span>
                </div>
                <p className="text-white">{segment.description}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-400 mt-8">
            {isLoading ? (
              <div className="animate-pulse">Searching video...</div>
            ) : (
              'Enter a search query to find moments in the video'
            )}
          </div>
        )}
      </div>
    </div>
  );
} 