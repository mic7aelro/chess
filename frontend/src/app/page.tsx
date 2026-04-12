'use client';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Chess } from 'chess.js';
import { BookOpen, Check, Library, SkipBack, SkipForward, ChevronLeft, ChevronRight, Swords, ScrollText } from 'lucide-react';

function SolidThumbsUp({ size = 20, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
      <path d="M2 20h2c.55 0 1-.45 1-1v-9c0-.55-.45-1-1-1H2v11zm19.83-7.12c.11-.25.17-.52.17-.8V11c0-1.1-.9-2-2-2h-5.5l.92-4.65c.05-.22.02-.46-.08-.66-.23-.45-.52-.86-.88-1.22L14 2 7.59 8.41C7.21 8.79 7 9.3 7 9.83V18c0 1.1.9 2 2 2h9c.83 0 1.58-.51 1.83-1.22l3-7.12z"/>
    </svg>
  );
}
import { MoveList } from '@/components/MoveList';
import { EvalGraph } from '@/components/EvalGraph';
import { AccuracyCards } from '@/components/AccuracyCards';
import { BoardPanel } from '@/components/BoardPanel';
import { EngineLines } from '@/components/EngineLines';
import { LibraryPanel } from '@/components/LibraryPanel';
import { RepertoirePanel } from '@/components/RepertoirePanel';
import { getFolders, saveReview, createFolder, getRepertoire } from '@/lib/library';
import type { RepertoireMove } from '@/types';
import type { AnalysisResult, Classification, TopLine } from '@/types';

// ---------------------------------------------------------------------------
// Win-probability classification
// ---------------------------------------------------------------------------
function cpToWinProb(cp: number): number {
  if (cp >= 10000) return 1;
  if (cp <= -10000) return 0;
  return 1 / (1 + Math.pow(10, -cp / 400));
}

function classifyMove(scoreBefore: number, scoreAfter: number): Classification {
  const loss = Math.max(0, cpToWinProb(scoreBefore) - cpToWinProb(scoreAfter));
  if (loss < 0.005) return 'best';
  if (loss < 0.02)  return 'excellent';
  if (loss < 0.05)  return 'good';
  if (loss < 0.10)  return 'inaccuracy';
  if (loss < 0.20)  return 'mistake';
  return 'blunder';
}

type IconComponent = React.ComponentType<{ size?: number; strokeWidth?: number }>;

// Chess.com-accurate classification colours
const CLS_LABEL: Record<Classification, {
  symbol?: string;
  Icon?: IconComponent;
  strokeWidth?: number;
  label: string;
  textClass: string;
  badgeBg: string;
  badgeText: string;
}> = {
  book:       { Icon: BookOpen, label: 'Book',       textClass: 'text-[#a0784a]', badgeBg: '#7c4e28', badgeText: '#f5dfc0', strokeWidth: 1.5 },
  brilliant:  { symbol: '!!',  label: 'Brilliant',  textClass: 'text-[#1fada8]', badgeBg: '#1fada8', badgeText: '#fff' },
  great:      { symbol: '!',   label: 'Great',      textClass: 'text-[#5c8fff]', badgeBg: '#5c8fff', badgeText: '#fff' },
  best:       { symbol: '★',   label: 'Best',       textClass: 'text-[#6fbc5b]', badgeBg: '#6fbc5b', badgeText: '#fff' },
  excellent:  { label: 'Excellent', textClass: 'text-[#6fbc5b]', badgeBg: '#6fbc5b', badgeText: '#fff' },
  good:       { Icon: Check,   label: 'Good',       textClass: 'text-[#96bc4b]', badgeBg: '#96bc4b', badgeText: '#fff' },
  inaccuracy: { symbol: '?!',  label: 'Inaccuracy', textClass: 'text-[#f4bf00]', badgeBg: '#f4bf00', badgeText: '#fff' },
  mistake:    { symbol: '?',   label: 'Mistake',    textClass: 'text-[#e07b2a]', badgeBg: '#e07b2a', badgeText: '#fff' },
  miss:       { symbol: '⊘',   label: 'Miss',       textClass: 'text-[#e05c2a]', badgeBg: '#e05c2a', badgeText: '#fff' },
  blunder:    { symbol: '??',  label: 'Blunder',    textClass: 'text-[#ca3431]', badgeBg: '#ca3431', badgeText: '#fff' },
};

const SIDEBAR_W    = 208;  // w-52
const LIBRARY_W    = 256;  // w-64
const PLAY_PANEL_W = 220;

function useBoardSize(panelOpen: boolean) {
  const [size, setSize] = useState(600);
  useEffect(() => {
    function calc() {
      const extra  = panelOpen ? LIBRARY_W : 0;
      const rightW = window.innerWidth * 0.25;
      const fromWidth  = window.innerWidth - SIDEBAR_W - extra - rightW - 80;
      const fromHeight = window.innerHeight - 160;
      setSize(Math.floor(Math.min(fromWidth, fromHeight)));
    }
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, [panelOpen]);
  return size;
}

// ---------------------------------------------------------------------------
// Explore state
// ---------------------------------------------------------------------------
interface ExploreFrame {
  fen: string;
  from_sq: string;
  to_sq: string;
  evalCp: number;
  lines: TopLine[];
  san: string;
}

// ---------------------------------------------------------------------------
// Right-panel states
// ---------------------------------------------------------------------------
type PanelState = 'menu' | 'paste' | 'analysis' | 'freeplay' | 'play' | 'repertoire';

export default function Home() {
  const [result, setResult]           = useState<AnalysisResult | null>(null);
  const [loading, setLoading]         = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<{ analyzed: number; total: number } | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [selectedPly, setSelectedPly] = useState<number | null>(null);
  const [flipped, setFlipped]         = useState(false);
  const [panelState, setPanelState]   = useState<PanelState>('play');
  const [pgn, setPgn]                 = useState('');

  const [exploreHistory, setExploreHistory]   = useState<ExploreFrame[]>([]);
  const [exploreIdx, setExploreIdx]           = useState(-1);
  const [exploreBranchPly, setExploreBranchPly] = useState<number | null>(null);
  const isExploring         = exploreIdx >= 0;
  const currentExploreFrame = exploreIdx >= 0 ? exploreHistory[exploreIdx] : null;

  const [isQuickLoaded, setIsQuickLoaded]   = useState(false);
  const [playThinking, setPlayThinking]     = useState(false);
  const [showEvalBar, setShowEvalBar]       = useState(true);

  // Repertoire — loaded when an analysis result is present
  const [repertoireWhite, setRepertoireWhite] = useState<RepertoireMove[]>([]);
  const [repertoireBlack, setRepertoireBlack] = useState<RepertoireMove[]>([]);

  useEffect(() => {
    if (!result) return;
    getRepertoire('white').then(setRepertoireWhite).catch(() => {});
    getRepertoire('black').then(setRepertoireBlack).catch(() => {});
  }, [result]);

  // Build fen→prepSan map for deviation detection in MoveList
  const repertoirePrep = (() => {
    if (!result) return undefined;
    const map = new Map<string, string>();
    const normFen = (f: string) => f.split(' ').slice(0, 4).join(' ');
    [...repertoireWhite, ...repertoireBlack].forEach(m => {
      map.set(normFen(m.fen), m.san);
    });
    return map.size > 0 ? map : undefined;
  })();

  // Library
  const [libraryOpen, setLibraryOpen]   = useState(false);
  const [saveModal, setSaveModal]        = useState(false);
  const [saveFolderId, setSaveFolderId]  = useState('');
  const [saveGameName, setSaveGameName]  = useState('');
  const [libraryRefresh, setLibraryRefresh] = useState(0);

  const boardSize = useBoardSize(libraryOpen);

  // Progressive deepening — lines that update as Stockfish searches deeper
  const [deepLines, setDeepLines] = useState<TopLine[]>([]);
  const [deepDepth, setDeepDepth] = useState<number | null>(null);
  const deepFenRef = useRef<string>('');

  // Animate board pieces only when a move is physically made (drag/click), not during navigation
  const [animatePieces, setAnimatePieces] = useState(false);

  // ---------------------------------------------------------------------------
  // Analysis
  // ---------------------------------------------------------------------------
  async function handleAnalyse() {
    if (!pgn.trim()) return;
    setLoading(true);
    setError(null);
    // Keep the existing result visible during re-analysis so the board stays on screen.
    // It will be replaced when the new result arrives.
    if (!result) setResult(null);
    setIsQuickLoaded(false);
    setSelectedPly(null);
    setExploreHistory([]);
    setExploreIdx(-1);
    setAnalysisProgress(null);
    try {
      const res = await fetch(`${API}/api/analysis/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pgn: pgn.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail ?? 'Analysis failed');
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const event = JSON.parse(line.slice(6));
          if (event.type === 'progress') {
            setAnalysisProgress({ analyzed: event.analyzed, total: event.total });
          } else if (event.type === 'complete') {
            setResult(event.result);
            setPanelState('analysis');
          } else if (event.type === 'error') {
            throw new Error(event.detail ?? 'Analysis failed');
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
      setAnalysisProgress(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Derive display state
  // ---------------------------------------------------------------------------
  const gameMoveAtPly = result && selectedPly !== null
    ? result.moves.find((m) => m.ply === selectedPly) ?? null
    : null;

  const gameFen       = gameMoveAtPly?.fen ?? result?.starting_fen ?? 'start';
  const gameEval      = gameMoveAtPly?.eval ?? 0;
  const gameLines     = gameMoveAtPly?.top_lines ?? result?.initial_lines ?? [];
  const gameLastMove  = gameMoveAtPly
    ? { from: gameMoveAtPly.from_sq, to: gameMoveAtPly.to_sq }
    : null;
  const gameIsWhiteToMove = (selectedPly ?? 0) % 2 === 0;

  const displayFen         = isExploring ? currentExploreFrame!.fen    : gameFen;
  const displayEval        = deepLines.length > 0 ? deepLines[0].eval : (isExploring ? currentExploreFrame!.evalCp : gameEval);
  const displayLines       = deepLines.length > 0 ? deepLines : (isExploring ? currentExploreFrame!.lines : gameLines);
  const displayLastMove    = isExploring
    ? { from: currentExploreFrame!.from_sq, to: currentExploreFrame!.to_sq }
    : gameLastMove;
  const displayIsWhiteToMove = isExploring
    ? new Chess(currentExploreFrame!.fen === 'start' ? undefined : currentExploreFrame!.fen).turn() === 'w'
    : gameIsWhiteToMove;

  // ---------------------------------------------------------------------------
  // Navigation helpers
  // ---------------------------------------------------------------------------
  function navFirst() {
    if (isExploring || exploreHistory.length > 0) {
      // Move cursor to start without wiping history
      setExploreIdx(-1);
    } else if (result) {
      setSelectedPly(null);
    }
  }

  function navBack() {
    if (isExploring) {
      // Step back within the alternate line; bottoms out at -1 (branch point)
      setExploreIdx((i) => (i > 0 ? i - 1 : -1));
    } else if (result) {
      // Navigate main game backward — branch annotation stays visible
      setSelectedPly((p) => (p === null || p <= 1 ? null : p - 1));
    }
  }

  function navForward() {
    if (isExploring) {
      // Advance within the alternate line only
      setExploreIdx((i) => (i < exploreHistory.length - 1 ? i + 1 : i));
    } else if (result) {
      // At the branch point (exploreIdx = -1) or in the main game: advance main game
      const maxPly = result.moves[result.moves.length - 1]?.ply ?? 0;
      setSelectedPly((p) => { const n = (p ?? 0) + 1; return n > maxPly ? p : n; });
    }
  }

  function navLast() {
    if (exploreHistory.length > 0) {
      setExploreIdx(exploreHistory.length - 1);
    } else if (result) {
      const maxPly = result.moves[result.moves.length - 1]?.ply ?? 0;
      setSelectedPly(maxPly);
    }
  }

  // ---------------------------------------------------------------------------
  // Piece drag / click-to-move
  // ---------------------------------------------------------------------------
  function handlePieceDrop(from: string, to: string): boolean {
    const baseFen = isExploring ? currentExploreFrame!.fen : gameFen;
    const chess   = baseFen === 'start' ? new Chess() : new Chess(baseFen);

    let moveResult: ReturnType<Chess['move']>;
    try { moveResult = chess.move({ from, to, promotion: 'q' }); }
    catch { return false; }
    if (!moveResult) return false;

    const newFen    = chess.fen();
    const san       = moveResult.san;
    const userFrame: ExploreFrame = { fen: newFen, from_sq: from, to_sq: to, evalCp: isExploring ? currentExploreFrame!.evalCp : gameEval, lines: [], san };

    // Truncate any future history at current cursor position, then append new frame
    const newHistory = [...exploreHistory.slice(0, exploreIdx + 1), userFrame];
    const newUserIdx = newHistory.length - 1;
    setAnimatePieces(true);
    setExploreHistory(newHistory);
    setExploreIdx(newUserIdx);
    // Record the branch point whenever starting from the main game (not extending an existing branch)
    if (!isExploring) {
      setExploreBranchPly(selectedPly ?? null);
    }
    setTimeout(() => setAnimatePieces(false), 200);

    // Auto-enter freeplay mode when making moves without a loaded game (not in play mode)
    if (!result && panelState !== 'play') setPanelState('freeplay');

    // In play mode, have the engine reply — but only if the game isn't over
    if (panelState === 'play' && !chess.isGameOver()) {
      enginePlayMove(newFen, newUserIdx);
    }

    return true;
  }

  async function enginePlayMove(fenAfterUser: string, userMoveIdx: number) {
    setPlayThinking(true);
    try {
      const res  = await fetch(`${API}/api/analysis/best-move`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fen: fenAfterUser, depth: 15 }),
      });
      const data = await res.json();
      if (!data.move) return; // game already over
      // Small pause so the engine move lands naturally and the board
      // has time to settle before the position changes again.
      await new Promise(r => setTimeout(r, 350));
      const engineFrame: ExploreFrame = { fen: data.fen, from_sq: data.from_sq, to_sq: data.to_sq, evalCp: 0, lines: [], san: data.san };
      setAnimatePieces(true);
      setExploreHistory((prev) => {
        const base = prev.slice(0, userMoveIdx + 1);
        return [...base, engineFrame];
      });
      setExploreIdx(userMoveIdx + 1);
      setTimeout(() => setAnimatePieces(false), 200);
    } catch (e) {
      console.error('Engine move failed:', e);
    } finally {
      setPlayThinking(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Explore navigation
  // ---------------------------------------------------------------------------
  function exitExplore() {
    setExploreIdx(-1);
    setExploreHistory([]);
    setExploreBranchPly(null);
  }

  // Just step out of the active branch cursor without wiping the branch annotation
  function deactivateExplore() {
    setExploreIdx(-1);
  }

  // Build a PGN string from the current explore history up to the view cursor (for freeplay Review)
  function buildExploreAsPgn(): string {
    const frames = exploreHistory.slice(0, exploreIdx + 1);
    let pgn = '';
    frames.forEach((frame, i) => {
      if (i % 2 === 0) pgn += `${Math.floor(i / 2) + 1}. `;
      pgn += frame.san + ' ';
    });
    return pgn.trim();
  }

  async function handleFreeplayReview() {
    const freeplayPgn = buildExploreAsPgn();
    if (!freeplayPgn) return;
    exitExplore();
    setPgn(freeplayPgn);
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedPly(null);
    try {
      const res = await fetch(`${API}/api/analysis/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pgn: freeplayPgn }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail ?? 'Analysis failed');
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const event = JSON.parse(line.slice(6));
          if (event.type === 'complete') { setResult(event.result); setPanelState('analysis'); }
          else if (event.type === 'error') throw new Error(event.detail ?? 'Analysis failed');
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setPanelState('paste');
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------
  function handleExportAnalysis() {
    if (!result) return;

    const CLASSIFICATIONS: Classification[] = [
      'brilliant', 'great', 'best', 'excellent', 'good',
      'inaccuracy', 'mistake', 'miss', 'blunder', 'book',
    ];

    const whiteMoves = result.moves.filter((m) => m.ply % 2 === 1);
    const blackMoves = result.moves.filter((m) => m.ply % 2 === 0);

    const countBy = (moves: typeof result.moves) =>
      Object.fromEntries(
        CLASSIFICATIONS.map((c) => [c, moves.filter((m) => m.classification === c).length])
      );

    const movesByClassification = Object.fromEntries(
      CLASSIFICATIONS.map((c) => [
        c,
        result.moves
          .filter((m) => m.classification === c)
          .map((m) => ({
            move_number: Math.ceil(m.ply / 2),
            color: m.ply % 2 === 1 ? 'white' : 'black',
            san: m.san,
            eval_before: (() => {
              const idx = result.moves.indexOf(m);
              return idx > 0 ? result.moves[idx - 1].eval : 0;
            })(),
            eval_after: m.eval,
            cp_loss: m.cp_loss,
          })),
      ])
    );

    const exportData = {
      metadata: {
        white: result.headers.White ?? 'White',
        black: result.headers.Black ?? 'Black',
        date: result.headers.Date,
        event: result.headers.Event,
        result: result.headers.Result,
        opening: result.opening
          ? `${result.opening.eco} ${result.opening.name}`
          : undefined,
        exported_at: new Date().toISOString(),
      },
      pgn,
      accuracy: {
        white: result.white?.accuracy ?? null,
        black: result.black?.accuracy ?? null,
      },
      game_rating: {
        white: result.white?.elo ?? null,
        black: result.black?.elo ?? null,
      },
      classification_counts: {
        white: countBy(whiteMoves),
        black: countBy(blackMoves),
      },
      moves_by_classification: movesByClassification,
      evaluation_graph: result.moves.map((m) => ({
        ply: m.ply,
        move_number: Math.ceil(m.ply / 2),
        color: m.ply % 2 === 1 ? 'white' : 'black',
        san: m.san,
        eval: m.eval,
        classification: m.classification,
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${result.headers.White ?? 'White'}_vs_${result.headers.Black ?? 'Black'}_analysis.json`
      .replace(/\s+/g, '_');
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------------
  // Library handlers
  // ---------------------------------------------------------------------------
  async function handleSaveToLibrary() {
    if (!result) return;
    const white = result.headers.White ?? 'White';
    const black = result.headers.Black ?? 'Black';
    setSaveGameName(`${white} vs ${black}`);
    const folders = await getFolders();
    setSaveFolderId(folders[0]?.id ?? '');
    setSaveModal(true);
  }

  async function handleConfirmSave() {
    if (!result) return;
    const white = result.headers.White ?? 'White';
    const black = result.headers.Black ?? 'Black';
    await saveReview({
      folderId: saveFolderId,
      name: saveGameName.trim() || `${white} vs ${black}`,
      pgn,
      white,
      black,
      date: result.headers.Date,
      result,
    });
    setSaveModal(false);
    setLibraryRefresh((n) => n + 1);
  }

  function handleLoadFromLibrary(loadPgn: string, loadResult: AnalysisResult) {
    setPgn(loadPgn);
    setResult(loadResult);
    setIsQuickLoaded(false);
    setSelectedPly(null);
    setExploreHistory([]);
    setExploreIdx(-1);
    setPanelState('analysis');
    setLibraryOpen(false);
  }

  async function handleRerunFromLibrary(loadPgn: string) {
    setPgn(loadPgn);
    setLibraryOpen(false);
    setPanelState('paste');
    // Small delay so the paste panel renders before we kick off analysis
    setTimeout(() => {
      setLoading(true);
      setError(null);
      setResult(null);
      setSelectedPly(null);
      setExploreHistory([]);
      setExploreIdx(-1);
      setAnalysisProgress(null);
      fetch(`${API}/api/analysis/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pgn: loadPgn.trim() }),
      }).then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.detail ?? 'Analysis failed');
        }
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop()!;
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const event = JSON.parse(line.slice(6));
            if (event.type === 'progress') setAnalysisProgress({ analyzed: event.analyzed, total: event.total });
            else if (event.type === 'complete') { setResult(event.result); setPanelState('analysis'); }
            else if (event.type === 'error') throw new Error(event.detail ?? 'Analysis failed');
          }
        }
      }).catch((e) => {
        setError(e instanceof Error ? e.message : 'Unknown error');
      }).finally(() => {
        setLoading(false);
        setAnalysisProgress(null);
      });
    }, 50);
  }

  // ---------------------------------------------------------------------------
  // Quick load (no analysis)
  // ---------------------------------------------------------------------------
  function handleQuickLoad() {
    const text = pgn.trim();
    if (!text) return;
    setError(null);

    // Detect FEN vs PGN: FEN has 6 space-separated tokens, first has 8 slash-separated ranks
    const isFen = (() => {
      const parts = text.split(/\s+/);
      return parts.length >= 4 && parts[0].split('/').length === 8;
    })();

    if (isFen) {
      try {
        new Chess(text); // validates the FEN
        // Minimal result so the analysis panel footer (Analyse + Save) renders
        setPgn(`[FEN "${text}"]\n[SetUp "1"]\n\n*`);
        setResult({
          headers: { FEN: text, SetUp: '1' },
          starting_fen: text,
          initial_lines: [],
          moves: [],
          white: { accuracy: 0, elo: 0 },
          black: { accuracy: 0, elo: 0 },
        });
        setIsQuickLoaded(true);
        setSelectedPly(null);
        setExploreHistory([]);
        setExploreIdx(-1);
        setPanelState('analysis');
      } catch {
        setError('Invalid FEN.');
      }
      return;
    }

    // PGN — parse moves client-side, no engine
    try {
      const chess = new Chess();
      chess.loadPgn(text);
      const history = chess.history({ verbose: true }) as Array<{ san: string; from: string; to: string }>;
      if (history.length === 0) {
        setError('No moves found in PGN.');
        return;
      }
      const replay = new Chess();
      const moves: import('@/types').MoveEval[] = history.map((m, i) => {
        replay.move(m);
        return {
          ply: i + 1,
          san: m.san,
          from_sq: m.from,
          to_sq: m.to,
          eval: 0,
          cp_loss: 0,
          classification: null as unknown as import('@/types').Classification, // unanalysed — no badge
          is_book: false,
          fen: replay.fen(),
          top_lines: [],
          alt_lines: [],
        };
      });
      const hdrs = chess.header() as Record<string, string>;
      setResult({
        headers: hdrs,
        starting_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        initial_lines: [],
        moves,
        white: { accuracy: 0, elo: 0 },
        black: { accuracy: 0, elo: 0 },
      });
      setIsQuickLoaded(true);
      setSelectedPly(null);
      setExploreHistory([]);
      setExploreIdx(-1);
      setPanelState('analysis');
    } catch {
      setError('Could not parse PGN.');
    }
  }

  // ---------------------------------------------------------------------------
  // Keyboard navigation
  // ---------------------------------------------------------------------------
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft')  navBack();
      if (e.key === 'ArrowRight') navForward();
      if (e.key === 'Escape' && isExploring) exitExplore();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result, isExploring, exploreIdx, exploreHistory.length, selectedPly],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  // ---------------------------------------------------------------------------
  // Progressive deepening — only runs when exploring alt lines.
  // Game moves already have depth-20 lines from batch analysis.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // For fully-analyzed games: use pre-computed lines, no live engine needed.
    // For quick-loaded or explore mode: run progressive deepening.
    if (!isExploring && result && !isQuickLoaded) {
      setDeepLines([]);
      setDeepDepth(null);
      return;
    }

    const fen = displayFen === 'start'
      ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      : displayFen;

    deepFenRef.current = fen;
    setDeepLines([]);
    setDeepDepth(null);

    let cancelled = false;

    (async () => {
      for (const depth of [8, 10, 12, 14, 16, 18, 20]) {
        if (cancelled || deepFenRef.current !== fen) break;
        try {
          const res = await fetch(`${API}/api/analysis/eval`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen, depth }),
          });
          if (cancelled || deepFenRef.current !== fen) break;
          const data: { eval: number; top_lines: TopLine[]; depth: number } = await res.json();
          if (cancelled || deepFenRef.current !== fen) break;
          setDeepLines(data.top_lines);
          setDeepDepth(data.depth);
        } catch { break; }
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayFen, isExploring, isQuickLoaded]);

  // Eval bar value — two separate effects so displayEval changes in play mode
  // never cancel or trigger the depth-based timer.
  //
  //   • Non-play: follow displayEval immediately (precomputed evals from analysis).
  //   • Play: only update from depth ≥ 12 deepening results, debounced 900ms.
  //     deepLines clearing (position change) cancels any pending timer so we never
  //     fire the old position's eval onto the new position. Bar holds its last value
  //     until a fresh depth-12+ result settles.
  const [evalBarCp, setEvalBarCp] = useState(0);

  // Precomputed positions (analysis, not exploring, not quick-loaded):
  // deepLines stays empty so update immediately — these evals are already depth-18 accurate.
  useEffect(() => {
    if (panelState === 'play') return;
    if (isExploring || isQuickLoaded) return;
    if (deepLines.length > 0) return;
    setEvalBarCp(displayEval);
  }, [displayEval, panelState, isExploring, isQuickLoaded, deepLines.length]);

  // Progressive deepening active (explore / quick-load / play):
  // Hold bar until depth ≥ 12 arrives, then debounce so rapid depth steps don't jitter.
  useEffect(() => {
    if (deepLines.length === 0) return;           // no result yet — hold current value
    if ((deepDepth ?? 0) < 12) return;            // too shallow — hold
    const ms  = panelState === 'play' ? 900 : 600;
    const val = deepLines[0].eval;
    const t   = setTimeout(() => setEvalBarCp(val), ms);
    return () => clearTimeout(t);
  }, [deepLines, deepDepth, panelState]);

  // Live opening detection for play mode
  const [playOpening, setPlayOpening] = useState<{ name: string; eco: string } | null>(null);
  useEffect(() => {
    if (panelState !== 'play') return;
    const fen = displayFen === 'start'
      ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      : displayFen;
    let cancelled = false;
    fetch(`${API}/api/analysis/opening`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ fen }),
    })
      .then(r => r.json())
      .then(data => { if (!cancelled) setPlayOpening(data.name ? data : null); })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayFen, panelState]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex min-h-screen bg-black text-white">

      {/* ── Sidebar ── */}
      <div className="sticky top-0 h-screen w-52 shrink-0 flex flex-col border-r border-zinc-800 bg-black z-20">
        {/* Branding */}
        <div className="flex items-center justify-center gap-2.5 px-5 border-b border-zinc-800" style={{ height: 48 }}>
          <span className="text-white font-bold text-base tracking-tight">Mercury Chess</span>
        </div>
        {/* Nav tabs */}
        <div className="flex flex-col pt-3 px-2 gap-0.5">
          <SidebarTab
            icon={<Swords size={18} />}
            label="Play"
            active={panelState === 'play'}
            onClick={() => { setLibraryOpen(false); setPanelState('play'); }}
          />
          <SidebarTab
            icon={<BookOpen size={18} />}
            label="Analysis"
            active={panelState === 'paste' || panelState === 'analysis'}
            onClick={() => { setLibraryOpen(false); setPanelState(result ? 'analysis' : 'paste'); }}
          />
          <SidebarTab
            icon={<Library size={18} />}
            label="Library"
            active={libraryOpen}
            onClick={() => { setLibraryOpen((o) => !o); setPanelState('menu'); }}
          />
          <SidebarTab
            icon={<ScrollText size={18} />}
            label="Repertoire"
            active={panelState === 'repertoire'}
            onClick={() => { setLibraryOpen(false); setPanelState('repertoire'); }}
          />
        </div>
      </div>

      {/* ── Library panel (slides in next to sidebar) ── */}
      <div
        className="sticky top-0 h-screen shrink-0 flex flex-col border-r border-zinc-800 bg-[#0e0e0e] overflow-hidden transition-all duration-200"
        style={{ width: libraryOpen ? 256 : 0 }}
      >
        <div style={{ width: 256 }} className="h-full">
          <LibraryPanel
            onLoad={handleLoadFromLibrary}
            onRerun={handleRerunFromLibrary}
            refreshKey={libraryRefresh}
          />
        </div>
      </div>

      {/* ── Left column: board ── */}
      <div className={`sticky top-0 h-screen flex-1 shrink-0 flex flex-col relative ${panelState !== 'play' ? 'border-r border-zinc-800' : ''}`}>

        {/* Board: centred in available space */}
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col gap-2">
            {/* Top player label */}
            {result && (() => {
              const name = flipped ? result.headers.White    : result.headers.Black;
              const elo  = flipped ? result.headers.WhiteElo : result.headers.BlackElo;
              if (!name || name === '?') return null;
              return (
                <p className="text-base font-semibold text-zinc-200 truncate leading-none">
                  {name}
                  {elo && elo !== '?' && <span className="text-sm text-zinc-500 font-normal ml-2">({elo})</span>}
                </p>
              );
            })()}
            <BoardPanel
              fen={displayFen}
              lastMove={displayLastMove}
              evalCp={evalBarCp}
              orientation={flipped ? 'black' : 'white'}
              onPieceDrop={handlePieceDrop}
              size={boardSize}
              showEvalBar={showEvalBar}
              animatePieces={animatePieces}
              badgeScale={!isExploring && gameMoveAtPly?.classification === 'miss' ? 1.4 : 1}
              badge={!isExploring && gameMoveAtPly?.classification ? (() => {
                const isMiss  = gameMoveAtPly.classification === 'miss';
                const cls = CLS_LABEL[gameMoveAtPly.classification];
                const badgePx = (boardSize / 8) * 0.35 * (isMiss ? 1.4 : 1);
                const iconPx  = Math.round(badgePx * 0.55);
                const fontPx  = Math.round(badgePx * (isMiss ? 0.85 : 0.65));
                return (
                  <span
                    className="w-full h-full rounded-full flex items-center justify-center font-bold shadow-md"
                    style={{ backgroundColor: cls.badgeBg, color: cls.badgeText }}
                  >
                    {gameMoveAtPly.classification === 'excellent'
                      ? <SolidThumbsUp size={iconPx} color={cls.badgeText} />
                      : cls.Icon
                      ? <cls.Icon size={iconPx} strokeWidth={cls.strokeWidth ?? 3.5} />
                      : (cls.symbol === '!!' || cls.symbol === '??' || cls.symbol === '?!')
                      ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, gap: 0 }}>
                          {cls.symbol.split('').map((ch, i) => (
                            <span key={i} style={{ fontWeight: 900, fontSize: `${fontPx}px`, lineHeight: 1, display: 'block', WebkitTextStroke: '0.5px currentColor' }}>{ch}</span>
                          ))}
                        </span>
                      : <span style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: `${cls.symbol === '★' ? fontPx * 1.4 : fontPx}px`,
                          lineHeight: 1,
                          fontWeight: (cls.symbol === '?' || isMiss) ? 900 : 'bold',
                          WebkitTextStroke: (cls.symbol === '?' || isMiss) ? '1px currentColor' : undefined,
                          marginTop: cls.symbol === '★' ? '-5px' : '0',
                        }}>{cls.symbol}</span>}
                  </span>
                );
              })() : undefined}
            />

            {/* Bottom row: player name left, controls right — same baseline */}
            <div className="flex items-center justify-between gap-3">
              {/* Bottom player name */}
              {result ? (() => {
                const name = flipped ? result.headers.Black  : result.headers.White;
                const elo  = flipped ? result.headers.BlackElo : result.headers.WhiteElo;
                if (!name || name === '?') return <div />;
                return (
                  <p className="text-base font-semibold text-zinc-200 truncate leading-none">
                    {name}
                    {elo && elo !== '?' && <span className="text-sm text-zinc-500 font-normal ml-2">({elo})</span>}
                  </p>
                );
              })() : <div />}

              {/* Right controls */}
              <div className="flex items-center gap-3 shrink-0">
                {playThinking && (
                  <span className="text-xs text-zinc-500 animate-pulse">Engine thinking…</span>
                )}
                {isExploring && (
                  <button
                    onClick={exitExplore}
                    className="text-base text-zinc-500 hover:text-zinc-200 border border-zinc-700 rounded-full px-3 py-0.5 transition-colors cursor-pointer leading-none"
                  >
                    ✕ exit explore
                  </button>
                )}
                <button
                  onClick={() => setFlipped((f) => !f)}
                  className="text-base text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer leading-none"
                >
                  ⇅ flip board
                </button>
              </div>
            </div>
          </div>
        </div>

        <p className="absolute bottom-3 left-5 text-xs text-zinc-700">
          ← → step · drag/click to explore · Esc exit
        </p>
      </div>

      {/* ── Play panel ── */}
      {panelState === 'play' && (
        <div className="w-1/4 sticky top-0 h-screen flex flex-col border-l border-zinc-800 shrink-0">
          {/* Header — matches analysis nav bar */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 shrink-0">
            <button
              onClick={() => setShowEvalBar((v) => !v)}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            >
              {showEvalBar ? 'Hide eval' : 'Show eval'}
            </button>
            <div className="flex items-center gap-1">
              <NavBtn onClick={navFirst}   title="First move"><SkipBack size={14} /></NavBtn>
              <NavBtn onClick={navBack}    title="Previous"><ChevronLeft size={14} /></NavBtn>
              <NavBtn onClick={navForward} title="Next"><ChevronRight size={14} /></NavBtn>
              <NavBtn onClick={navLast}    title="Last move"><SkipForward size={14} /></NavBtn>
            </div>
          </div>
          {/* Opening strip */}
          {playOpening && (
            <div className="shrink-0 border-b border-zinc-800 px-4 py-2">
              <p className="text-xs text-zinc-400 truncate">
                {playOpening.eco && <span className="font-mono font-semibold mr-1.5">{playOpening.eco}</span>}
                {playOpening.name}
              </p>
            </div>
          )}
          {/* Move list modal + resign */}
          <div className="flex flex-col flex-1 min-h-0 p-3 gap-3">
            <div className="flex-1 min-h-0 overflow-y-auto border border-zinc-800 rounded-lg bg-zinc-950/60">
              <div className="py-2">
                <FreeplayMoveList
                  frames={exploreHistory}
                  currentIdx={exploreIdx}
                  onSelectIdx={setExploreIdx}
                />
              </div>
            </div>
            {exploreHistory.length > 0 && (
              <button
                onClick={() => { exitExplore(); setPlayOpening(null); }}
                className="w-full py-2 text-xs font-semibold text-red-500 border border-red-900/50 rounded-lg hover:bg-red-950/40 transition-colors cursor-pointer shrink-0"
              >
                Resign
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Right column: 25% — 3-state panel ── */}
      {panelState === 'repertoire' && (
        <div className="w-1/4 flex flex-col h-screen border-l border-zinc-800">
          <RepertoirePanel onBack={() => setPanelState('menu')} />
        </div>
      )}

      {panelState !== 'play' && panelState !== 'repertoire' && <div className="w-1/4 flex flex-col h-screen border-l border-zinc-800">

        {/* ── Nav bar — shown in analysis mode above engine lines ── */}
        {panelState === 'analysis' && result && (
          <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 shrink-0">
            <button
              onClick={() => { setPanelState('paste'); exitExplore(); }}
              className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer text-sm"
            >
              ← Back
            </button>
            <div className="flex items-center gap-1">
              <NavBtn onClick={navFirst}   title="First move"><SkipBack size={14} /></NavBtn>
              <NavBtn onClick={navBack}    title="Previous"><ChevronLeft size={14} /></NavBtn>
              <NavBtn onClick={navForward} title="Next"><ChevronRight size={14} /></NavBtn>
              <NavBtn onClick={navLast}    title="Last move"><SkipForward size={14} /></NavBtn>
            </div>
          </div>
        )}

        {/* ── Engine analysis ── */}
        <div className="shrink-0 border-b border-zinc-800 px-3 py-3">
          {displayLines.length > 0
            ? <EngineLines lines={displayLines} isWhiteToMove={displayIsWhiteToMove} depth={deepDepth ?? (!isExploring && result ? 18 : undefined)} />
            : <p className="text-xs text-zinc-600 py-2 text-center">Analysing position…</p>
          }
        </div>

        {/* ── Opening name — updates as you navigate moves ── */}
        {result && (() => {
          // opening_name is stored one ply ahead of where it visually belongs,
          // so look at ply+1 first, then fall back to the game's last opening
          const nextMove = result.moves.find(m => m.ply === (selectedPly ?? 0) + 1);
          const name = nextMove?.opening_name ?? result.opening?.name;
          const eco  = nextMove?.opening_eco  ?? result.opening?.eco ?? '';
          if (!name) return null;
          return (
            <div className="shrink-0 border-b border-zinc-800 px-4 py-2">
              <p className="text-xs text-zinc-400">
                {eco && <span className="font-mono font-semibold mr-1.5">{eco}</span>}
                {name}
              </p>
            </div>
          );
        })()}

        {/* ── STATE: menu ── (empty landing) */}

        {/* ── STATE: freeplay ── */}
        {panelState === 'freeplay' && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
              <span className="text-xs text-zinc-400 font-semibold uppercase tracking-widest">Free Play</span>
              <div className="flex items-center gap-1">
                <NavBtn onClick={navBack}    title="Previous"><ChevronLeft size={14} /></NavBtn>
                <NavBtn onClick={navForward} title="Next"><ChevronRight size={14} /></NavBtn>
              </div>
            </div>

            {/* Move list modal + actions */}
            <div className="flex flex-col flex-1 min-h-0 p-3 gap-3">
              <div className="flex-1 min-h-0 overflow-y-auto border border-zinc-800 rounded-lg bg-zinc-950/60">
                <div className="py-2">
                  <FreeplayMoveList
                    frames={exploreHistory}
                    currentIdx={exploreIdx}
                    onSelectIdx={setExploreIdx}
                  />
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => { exitExplore(); setPanelState('menu'); }}
                  className="flex-1 py-2 text-xs text-zinc-400 border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  New
                </button>
                <button
                  onClick={handleFreeplayReview}
                  disabled={loading || exploreHistory.length === 0}
                  className="flex-1 py-2 text-xs font-semibold bg-white text-black rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {loading ? 'Analysing…' : 'Review'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STATE: paste ── */}
        {panelState === 'paste' && (
          <div className="flex flex-col gap-4 p-4 w-full">
            {/* Back header */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setPanelState(result ? 'analysis' : 'menu'); setError(null); }}
                className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer text-lg leading-none"
              >
                ←
              </button>
              <h2 className="text-sm font-semibold text-zinc-300">Analyze FEN / PGN</h2>
            </div>

            <textarea
              className="w-full h-52 bg-[#1a1a1a] border border-zinc-700 rounded-lg p-4 text-sm font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-400 resize-none"
              placeholder="Paste PGN or FEN here…"
              value={pgn}
              onChange={(e) => setPgn(e.target.value)}
              autoFocus
            />

            {error && <p className="text-red-400 text-sm">{error}</p>}

            {loading ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>
                    {analysisProgress && analysisProgress.total > 0
                      ? `Move ${Math.ceil(analysisProgress.analyzed / 2)} of ${Math.ceil(analysisProgress.total / 2)}`
                      : 'Detecting opening…'}
                  </span>
                  <span className="font-mono">depth {18}</span>
                </div>
                <AnalysisProgressBar
                  analyzed={analysisProgress?.analyzed ?? 0}
                  total={analysisProgress?.total ?? 0}
                />
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  className="px-5 py-2 bg-white text-black text-sm font-semibold rounded-full hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  onClick={handleAnalyse}
                  disabled={!pgn.trim()}
                  suppressHydrationWarning
                >
                  Analyse
                </button>
                <button
                  className="px-5 py-2 border border-zinc-600 text-zinc-300 text-sm font-semibold rounded-full hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  onClick={handleQuickLoad}
                  disabled={!pgn.trim()}
                >
                  Load FEN / PGN
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── STATE: analysis ── */}
        {panelState === 'analysis' && result && (
          <div className="flex flex-col flex-1 overflow-y-auto">

            {/* Quick-load action bar */}
            {isQuickLoaded && (
              <div className="shrink-0 border-b border-zinc-800 p-3 flex flex-col gap-2">
                <button
                  onClick={handleSaveToLibrary}
                  className="w-full py-2 text-xs font-semibold text-zinc-300 border border-zinc-700 rounded hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                >
                  Save to Library
                </button>
                <button
                  onClick={handleAnalyse}
                  disabled={loading || !pgn.trim()}
                  className="w-full py-2 text-xs font-semibold bg-white text-black rounded hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {loading ? 'Analysing…' : 'Analyse'}
                </button>
              </div>
            )}

            {/* Eval graph + accuracy cards — flows naturally, never clipped */}
            {(!isQuickLoaded || (result.white?.accuracy ?? 0) > 0) && (
              <div className="py-4 px-4 flex flex-col gap-5 border-b border-zinc-800">
                {!isQuickLoaded && (
                  <EvalGraph
                    moves={result.moves}
                    selectedPly={selectedPly}
                    onSelectPly={(ply) => { deactivateExplore(); setSelectedPly(ply); }}
                  />
                )}
                {result.white && result.black && result.white.accuracy > 0 && (
                  <AccuracyCards
                    whiteName={result.headers.White ?? 'White'}
                    blackName={result.headers.Black ?? 'Black'}
                    white={result.white}
                    black={result.black}
                    moves={result.moves}
                  />
                )}
              </div>
            )}

            {/* Move list — styled box, expands to fit all moves */}
            <div className="p-3 flex flex-col gap-3">
              <div className="border border-zinc-800 rounded-lg bg-zinc-950/60">
                <MoveList
                  result={result}
                  selectedPly={isExploring ? null : selectedPly}
                  onSelectPly={(ply) => { deactivateExplore(); setSelectedPly(ply); }}
                  exploreMoves={exploreHistory.length > 0
                    ? exploreHistory.map(f => ({
                        san: f.san,
                        classification: null,
                      }))
                    : undefined}
                  branchPly={exploreHistory.length > 0 ? exploreBranchPly : undefined}
                  activeExploreIdx={isExploring ? exploreIdx : undefined}
                  onSelectExploreMove={setExploreIdx}
                  showEval={false}
                  repertoirePrep={repertoirePrep}
                />
              </div>

              {/* Action buttons */}
              {!isQuickLoaded && (
                <div className="flex flex-col gap-2">
                  {loading && (
                    <div className="flex flex-col gap-2 px-1">
                      <div className="flex items-center justify-between text-xs text-zinc-500">
                        <span>
                          {analysisProgress && analysisProgress.total > 0
                            ? `Move ${Math.ceil(analysisProgress.analyzed / 2)} of ${Math.ceil(analysisProgress.total / 2)}`
                            : 'Detecting opening…'}
                        </span>
                        <span className="font-mono">depth 18</span>
                      </div>
                      <AnalysisProgressBar
                        analyzed={analysisProgress?.analyzed ?? 0}
                        total={analysisProgress?.total ?? 0}
                      />
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={handleAnalyse}
                      disabled={loading || !pgn.trim()}
                      className="flex-1 py-2 text-xs font-semibold text-zinc-300 border border-zinc-700 rounded-lg hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {loading ? 'Analysing…' : 'Re-Analyse'}
                    </button>
                    <button
                      onClick={handleExportAnalysis}
                      className="flex-1 py-2 text-xs font-semibold text-zinc-300 border border-zinc-700 rounded-lg hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                    >
                      Export JSON
                    </button>
                    <button
                      onClick={handleSaveToLibrary}
                      className="flex-1 py-2 text-xs font-semibold text-zinc-300 border border-zinc-700 rounded-lg hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                    >
                      Save to Library
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Save modal ── */}
        {saveModal && (
          <SaveModal
            gameName={saveGameName}
            folderId={saveFolderId}
            onChangeName={setSaveGameName}
            onChangeFolderId={setSaveFolderId}
            onConfirm={handleConfirmSave}
            onCancel={() => setSaveModal(false)}
          />
        )}

      </div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Save to Library modal
// ---------------------------------------------------------------------------
function SaveModal({
  gameName, folderId, onChangeName, onChangeFolderId, onConfirm, onCancel,
}: {
  gameName: string;
  folderId: string;
  onChangeName: (v: string) => void;
  onChangeFolderId: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [folders, setFolders] = useState<import('@/lib/library').SavedFolder[]>([]);
  const [newFolder, setNewFolder] = useState('');

  useEffect(() => { getFolders().then(setFolders); }, []);

  async function handleCreateFolder() {
    const name = newFolder.trim();
    if (!name) return;
    const f = await createFolder(name);
    const updated = await getFolders();
    setFolders(updated);
    onChangeFolderId(f.id);
    setNewFolder('');
  }

  return (
    <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a1a] border border-zinc-700 rounded-xl p-5 w-full max-w-xs flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-white">Save to Library</h3>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Game name</label>
          <input
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-white outline-none focus:border-zinc-500"
            value={gameName}
            onChange={(e) => onChangeName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Folder</label>
          {folders.length === 0 ? (
            <p className="text-xs text-zinc-600">No folders yet — create one below.</p>
          ) : (
            <select
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-white outline-none focus:border-zinc-500"
              value={folderId}
              onChange={(e) => onChangeFolderId(e.target.value)}
            >
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          )}
          <div className="flex gap-2 mt-1">
            <input
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-zinc-500"
              placeholder="New folder…"
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            />
            <button
              onClick={handleCreateFolder}
              className="text-xs text-zinc-400 border border-zinc-700 rounded px-2 py-1 hover:bg-zinc-700 cursor-pointer transition-colors"
            >
              Create
            </button>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 py-2 text-xs text-zinc-400 border border-zinc-700 rounded hover:bg-zinc-800 cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!folderId}
            className="flex-1 py-2 text-xs font-semibold bg-white text-black rounded hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function SidebarTab({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-md transition-colors cursor-pointer ${
        active ? 'text-white bg-zinc-800' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
      }`}
    >
      {icon}
      <span className="text-xs font-semibold tracking-widest uppercase">{label}</span>
    </button>
  );
}

function NavBtn({
  onClick, title, children,
}: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-9 h-9 flex items-center justify-center rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer text-sm"
    >
      {children}
    </button>
  );
}

function FreeplayMoveList({
  frames, currentIdx, onSelectIdx,
}: { frames: ExploreFrame[]; currentIdx: number; onSelectIdx?: (idx: number) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentIdx]);

  if (frames.length === 0) {
    return <p className="text-xs text-zinc-600 text-center mt-8">Make a move to begin</p>;
  }

  const pairs: Array<{ num: number; white: ExploreFrame; wIdx: number; black?: ExploreFrame; bIdx?: number }> = [];
  for (let i = 0; i < frames.length; i += 2) {
    pairs.push({ num: Math.floor(i / 2) + 1, white: frames[i], wIdx: i, black: frames[i + 1], bIdx: i + 1 });
  }

  return (
    <div ref={containerRef} className="divide-y divide-zinc-800/50">
      {pairs.map(({ num, white, wIdx, black, bIdx }) => (
        <div key={num} className="grid grid-cols-[2rem_1fr_1fr] gap-x-3 px-4 py-1 text-sm items-center">
          <span className="text-zinc-600 text-xs">{num}</span>
          <FreeplayMove frame={white} active={wIdx === currentIdx} onClick={() => onSelectIdx?.(wIdx)} />
          {black && bIdx !== undefined
            ? <FreeplayMove frame={black} active={bIdx === currentIdx} onClick={() => onSelectIdx?.(bIdx)} />
            : <span />}
        </div>
      ))}
    </div>
  );
}

function FreeplayMove({ frame, active, onClick }: { frame: ExploreFrame; active: boolean; onClick?: () => void }) {
  return (
    <button
      data-active={active ? 'true' : 'false'}
      onClick={onClick}
      className={`w-full flex items-center justify-start font-mono text-sm px-1.5 py-0.5 rounded transition-colors cursor-pointer ${active ? 'bg-zinc-700/60 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800/40'}`}
    >
      {frame.san}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Analysis progress bar — driven by real move-by-move progress from backend
// ---------------------------------------------------------------------------
function AnalysisProgressBar({ analyzed, total }: { analyzed: number; total: number }) {
  const pct = total > 0 ? Math.round((analyzed / total) * 100) : 0;
  return (
    <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
      <div
        className="h-full bg-white rounded-full transition-all duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// Classification summary bar — compact per-player counts with Chess.com-style badges
const CLS_ORDER: Classification[] = [
  'brilliant', 'great', 'best', 'excellent', 'good',
  'inaccuracy', 'mistake', 'miss', 'blunder',
];

import type { MoveEval } from '@/types';

function ClassificationSummary({ moves }: { moves: MoveEval[] }) {
  const whiteCounts: Partial<Record<Classification, number>> = {};
  const blackCounts: Partial<Record<Classification, number>> = {};

  for (const m of moves) {
    const isWhite = m.ply % 2 === 1;
    const bucket = isWhite ? whiteCounts : blackCounts;
    bucket[m.classification] = (bucket[m.classification] ?? 0) + 1;
  }

  const rows = CLS_ORDER.filter(
    (cls) => (whiteCounts[cls] ?? 0) > 0 || (blackCounts[cls] ?? 0) > 0,
  );

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="grid grid-cols-[1fr_28px_1fr] items-center gap-x-2 mb-1">
        <span className="text-[10px] text-zinc-500 uppercase tracking-widest text-right">White</span>
        <span />
        <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Black</span>
      </div>
      {rows.map((cls) => {
        const info = CLS_LABEL[cls];
        const w = whiteCounts[cls] ?? 0;
        const b = blackCounts[cls] ?? 0;
        return (
          <div key={cls} className="grid grid-cols-[1fr_28px_1fr] items-center gap-x-2 py-0.5">
            <span className={`text-xs text-right font-mono ${w > 0 ? 'text-zinc-200' : 'text-zinc-700'}`}>{w}</span>
            <span
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
              style={{ backgroundColor: info.badgeBg, color: info.badgeText }}
            >
              {info.Icon ? <info.Icon size={11} strokeWidth={2.5} /> : (info.symbol || '·')}
            </span>
            <span className={`text-xs font-mono ${b > 0 ? 'text-zinc-200' : 'text-zinc-700'}`}>{b}</span>
          </div>
        );
      })}
    </div>
  );
}
