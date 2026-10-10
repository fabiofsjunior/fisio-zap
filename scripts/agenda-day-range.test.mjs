import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const helperUrl = new URL('../app/lib/agenda-date-range.mjs', import.meta.url).href;
const childScript = `
  import assert from 'node:assert/strict';
  import { getLocalDayRange } from ${JSON.stringify(helperUrl)};
  const cases = [
    { day: '2025-03-09', nextDay: '2025-03-10', hours: 23 },
    { day: '2025-11-02', nextDay: '2025-11-03', hours: 25 },
  ];
  for (const { day, nextDay, hours } of cases) {
    const { from, to } = getLocalDayRange(day);
    assert.equal(from.getHours(), 0, day + ' starts at local midnight');
    assert.equal(to.getHours(), 0, day + ' ends at next local midnight');
    assert.equal(to.getFullYear() + '-' + String(to.getMonth() + 1).padStart(2, '0') + '-' + String(to.getDate()).padStart(2, '0'), nextDay);
    assert.equal((to.getTime() - from.getTime()) / 3600000, hours, day + ' has the expected elapsed duration');
  }
`;

test('local calendar-day range handles 23-hour and 25-hour days', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', childScript], {
    env: { ...process.env, TZ: 'America/New_York' },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
