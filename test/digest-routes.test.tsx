import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// Plan morning-digest § 2d. A temp runs dir: runs/ is read-only.
const good = (at: string, job: string, status: string, extra = '') =>
  `{"at":"${at}","job":"${job}","status":"${status}","owner":"rook"${extra}}`;

let app: ReturnType<typeof createApp>;

beforeAll(() => {
  const runsDir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  writeFileSync(
    join(runsDir, '2026-10-01.jsonl'),
    [
      good('2026-10-01T23:00:00+01:00', 'b/job', 'ok'),
      good('2026-10-02T01:00:00+01:00', 'a/job', 'retry', ',"error":"busy"'),
      good('2026-10-02T01:05:00+01:00', 'a/job', 'ok'),
    ].join('\n') + '\n',
  );
  writeFileSync(join(runsDir, '2026-10-02.jsonl'), '');
  writeFileSync(
    join(runsDir, '2026-10-03.jsonl'),
    [good('2026-10-03T23:00:00+01:00', 'c/job', 'fail', ',"error":"boom"'), '{"at":"2026-10-04T0'].join('\n') + '\n',
  );
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
});

const jobsInPage = (html: string) => [...html.matchAll(/<tr[^>]*><td>([^<]+)<\/td>/g)].map((m) => m[1]);

describe('GET /digest/:night', () => {
  it('200 with one row per job, sorted by job', async () => {
    const res = await app.request('/digest/2026-10-01');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(jobsInPage(html)).toEqual(['a/job', 'b/job']);
    expect(html).toContain('busy');
  });

  it('404 for a night with no file', async () => {
    expect((await app.request('/digest/2026-09-30')).status).toBe(404);
    expect((await app.request('/digest/not-a-night')).status).toBe(404);
  });

  it('the empty night renders "nothing ran"', async () => {
    const res = await app.request('/digest/2026-10-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('a night with a bad line still renders and counts it', async () => {
    const res = await app.request('/digest/2026-10-03');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(jobsInPage(html)).toEqual(['c/job']);
    expect(html).toContain('<tr class="warn">');
    expect(html).toMatch(/1 line in the log didn(&#39;|')t parse/);
  });
});

describe('GET /api/digest/:night', () => {
  it('200 with the same jobs, in the same order, as the page', async () => {
    const res = await app.request('/api/digest/2026-10-01');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { rows: { job: string }[] };
    const page = await (await app.request('/digest/2026-10-01')).text();
    expect(json.rows.map((r) => r.job)).toEqual(jobsInPage(page));
  });

  it('404 for a night with no file', async () => {
    expect((await app.request('/api/digest/2026-09-30')).status).toBe(404);
  });

  it('the empty night has no rows', async () => {
    const json = (await (await app.request('/api/digest/2026-10-02')).json()) as { rows: unknown[] };
    expect(json.rows).toEqual([]);
  });

  it('a night with a bad line returns its rows and the bad-line count', async () => {
    const json = (await (await app.request('/api/digest/2026-10-03')).json()) as {
      rows: { job: string; lastStatus: string }[];
      badLines: number;
    };
    expect(json.rows).toEqual([expect.objectContaining({ job: 'c/job', lastStatus: 'fail' })]);
    expect(json.badLines).toBe(1);
  });
});
