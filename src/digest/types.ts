// Plan morning-digest § 1. Committed before the reader so every part of § 2 can start against it.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing at the edge.
export type RunLine = { at: string; job: string; status: RunStatus; owner: string | null; error?: string };

// One row per job. Times keep the offset from the log.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  first: string;
  last: string;
};

export type Digest = {
  night: string;
  rows: DigestRow[]; // sorted by job; the page and the JSON use this order
  counts: Record<RunStatus, number>; // lines per status
  badLines: number; // lines that didn't parse
};

// null when there is no runs/<night>.jsonl (or night isn't YYYY-MM-DD).
export type ReadNight = (runsDir: string, night: string) => Digest | null;
