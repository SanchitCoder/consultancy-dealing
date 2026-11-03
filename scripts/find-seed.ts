/** Finds the first seed whose sample data tells the intended story at several reference dates. Usage: npx tsx scripts/find-seed.ts [maxSeed] */
import { generateSeed } from '@/lib/mock/seed';
import { measureStory, storyProblems } from '@/lib/mock/story';

const dates = ['2026-11-02T10:00:00Z', '2026-11-02T22:30:00Z', '2026-12-09T05:15:00Z', '2027-02-17T13:45:00Z'].map((d) => Date.parse(d));
const max = Number(process.argv[2] ?? 400);
let best: { seed: number; problems: number } | null = null;
for (let seed = 1; seed <= max; seed++) {
  const problems = dates.flatMap((now) => storyProblems(measureStory(generateSeed({ now, seed }), now)).map((p) => `${new Date(now).toISOString().slice(0, 10)}: ${p}`));
  if (!best || problems.length < best.problems) best = { seed, problems: problems.length };
  if (problems.length === 0) { console.log('FOUND seed', seed); process.exit(0); }
  if (seed % 50 === 0) console.log('...', seed, 'best so far', best);
}
console.log('no perfect seed in range; best', best);
