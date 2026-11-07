// Local best score (M10). Saved in local storage under `BEST_SCORE.storageKey`. If storage is
// missing or blocked, the best score lives for the session only.

import { BEST_SCORE } from '../data/ui';

export interface BestScore {
  score: number;
  /** Day the best run reached. */
  day: number;
  /** Whether that run completed the Phylactery. */
  won: boolean;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** Reads the saved best, or undefined if there is none (or it is junk). */
export function loadBestScore(storage: Store | undefined): BestScore | undefined {
  try {
    const text = storage?.getItem(BEST_SCORE.storageKey);
    if (!text) return undefined;
    const raw = JSON.parse(text) as Partial<BestScore>;
    if (typeof raw.score !== 'number' || !Number.isFinite(raw.score) || raw.score < 0) return undefined;
    return {
      score: Math.floor(raw.score),
      day: typeof raw.day === 'number' && raw.day >= 1 ? Math.floor(raw.day) : 1,
      won: raw.won === true,
    };
  } catch {
    return undefined;
  }
}

export class BestScoreTracker {
  best: BestScore | undefined;

  constructor(private readonly storage: Store | undefined) {
    this.best = loadBestScore(storage);
  }

  /**
   * Records a finished (or won) run. Returns true if it is a new best; ties are not.
   * A win records the score at completion; if the run later ends in endless mode with a
   * higher score, that replaces it.
   */
  record(result: BestScore): boolean {
    if (this.best && result.score <= this.best.score) return false;
    this.best = { score: result.score, day: result.day, won: result.won };
    try {
      this.storage?.setItem(BEST_SCORE.storageKey, JSON.stringify(this.best));
    } catch {
      // storage full or blocked: keep it for this session
    }
    return true;
  }
}
