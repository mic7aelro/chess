export type Classification =
  | 'book'
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder';

export interface TopLine {
  san: string;       // first move (kept for alt-line display)
  moves: string[];   // up to 17 SAN moves in the PV
  eval: number;      // centipawns, White's perspective
}

export interface MoveEval {
  ply: number;
  san: string;
  from_sq: string;
  to_sq: string;
  eval: number;             // centipawns, White's perspective
  cp_loss: number;
  classification: Classification;
  is_book: boolean;
  opening_name?: string;
  opening_eco?: string;
  fen: string;
  top_lines: TopLine[];
  alt_lines: TopLine[];
}

export interface PlayerStats {
  accuracy: number;  // 0–100
  elo: number;
}

export interface AnalysisResult {
  headers: Record<string, string>;
  starting_fen: string;
  initial_lines: TopLine[];
  moves: MoveEval[];
  opening?: { name: string; eco: string };
  white: PlayerStats;
  black: PlayerStats;
}
