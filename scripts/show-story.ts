import { generateSeed } from '@/lib/mock/seed';
import { measureStory, storyProblems } from '@/lib/mock/story';
const seed = Number(process.argv[2] ?? 1);
for (const d of ['2026-11-02T10:00:00Z', '2026-11-02T22:30:00Z', '2026-12-09T05:15:00Z', '2027-02-17T13:45:00Z']) {
  const now = Date.parse(d);
  const s = measureStory(generateSeed({ now, seed }), now);
  console.log(d, storyProblems(s));
  if (process.argv[3]) console.log(JSON.stringify(s));
}
