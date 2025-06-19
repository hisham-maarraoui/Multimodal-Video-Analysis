import React from 'react';

export default function Skeleton({ type }: { type: string }) {
  if (type === 'sections') {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-8 bg-gray-700/50 rounded w-3/4 animate-pulse" />
        ))}
        <div className="h-20 bg-gray-700/30 rounded mt-4 animate-pulse" />
      </div>
    );
  }
  if (type === 'transcript') {
    return (
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-6 bg-gray-700/50 rounded w-full animate-pulse" />
        ))}
      </div>
    );
  }
  if (type === 'chat') {
    return (
      <div className="flex flex-col h-full">
        <div className="h-10 bg-gray-700/40 rounded mb-4 animate-pulse" />
        <div className="flex-1 space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-8 bg-gray-700/30 rounded w-5/6 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }
  if (type === 'search') {
    return (
      <div className="space-y-2">
        <div className="h-10 bg-gray-700/40 rounded mb-2 animate-pulse" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-6 bg-gray-700/30 rounded w-2/3 animate-pulse" />
        ))}
      </div>
    );
  }
  return null;
} 