import type { AnalysisResult, RepertoireMove } from '@/types';

export interface SavedFolder {
  id: string;
  name: string;
  createdAt: number;
}

export interface SavedReview {
  id: string;
  folderId: string | null;
  name: string;
  pgn: string;
  white?: string;
  black?: string;
  date?: string;
  savedAt: number;
  result: AnalysisResult;
}

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/library`;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Library API error ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export async function getFolders(): Promise<SavedFolder[]> {
  return req<SavedFolder[]>('/folders');
}

export async function createFolder(name: string): Promise<SavedFolder> {
  return req<SavedFolder>('/folders', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function renameFolder(id: string, name: string): Promise<void> {
  await req(`/folders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function deleteFolder(id: string): Promise<void> {
  await req(`/folders/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Games / Reviews
// ---------------------------------------------------------------------------

export async function getReviews(): Promise<SavedReview[]> {
  return req<SavedReview[]>('/games');
}

export async function saveReview(
  data: Omit<SavedReview, 'id' | 'savedAt'>,
): Promise<SavedReview> {
  return req<SavedReview>('/games', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function renameReview(id: string, name: string): Promise<void> {
  await req(`/games/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function deleteReview(id: string): Promise<void> {
  await req(`/games/${id}`, { method: 'DELETE' });
}

export async function updateReviewAnalysis(
  id: string,
  result: AnalysisResult,
): Promise<void> {
  await req(`/games/${id}/analysis`, {
    method: 'PUT',
    body: JSON.stringify({ result }),
  });
}

// ---------------------------------------------------------------------------
// Repertoire
// ---------------------------------------------------------------------------

const REP_BASE = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/repertoire`;

async function repReq<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${REP_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Repertoire API error ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function getRepertoire(color: 'white' | 'black'): Promise<RepertoireMove[]> {
  return repReq<RepertoireMove[]>(`?color=${color}`);
}

export async function getRepertoirePosition(
  fen: string,
  color: 'white' | 'black',
): Promise<RepertoireMove | null> {
  return repReq<RepertoireMove | null>(
    `/position?fen=${encodeURIComponent(fen)}&color=${color}`,
  );
}

export async function addRepertoireMove(
  move: Omit<RepertoireMove, 'id' | 'addedAt'>,
): Promise<RepertoireMove> {
  return repReq<RepertoireMove>('', {
    method: 'POST',
    body: JSON.stringify(move),
  });
}

export async function deleteRepertoireMove(
  fen: string,
  move: string,
  color: 'white' | 'black',
): Promise<void> {
  await repReq('', {
    method: 'DELETE',
    body: JSON.stringify({ fen, move, color }),
  });
}

export interface ImportCandidate {
  fen: string;
  move: string;
  san: string;
  color: 'white' | 'black';
  count: number;
}

export async function importFromGames(color: 'white' | 'black'): Promise<ImportCandidate[]> {
  return repReq<ImportCandidate[]>(`/import?color=${color}`);
}
