'use client';

import { useState } from 'react';

interface Props {
  onAnalyse: (pgn: string) => void;
  loading: boolean;
}

export function PgnInput({ onAnalyse, loading }: Props) {
  const [pgn, setPgn] = useState('');

  return (
    <div className="flex flex-col gap-3">
      <textarea
        className="w-full h-40 bg-[#1a1a1a] border border-zinc-700 rounded-lg p-4 text-sm font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-400 resize-none"
        placeholder="Paste PGN here..."
        value={pgn}
        onChange={(e) => setPgn(e.target.value)}
      />
      <button
        className="self-start px-6 py-2 bg-white text-black text-sm font-semibold rounded-full hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={() => onAnalyse(pgn.trim())}
        disabled={loading || !pgn.trim()}
        suppressHydrationWarning
      >
        {loading ? 'Analysing...' : 'Analyse'}
      </button>
    </div>
  );
}
