import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Regression guard: moi cho convert sang gio VN trong SQL phai dung 2 buoc
 *   (col AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh'
 * Dang 1 buoc (col AT TIME ZONE 'Asia/Ho_Chi_Minh') bi Postgres hieu NGUOC
 * (coi col timestamp-khong-tz la gio VN local) -> lech -7h, roi nham ngay.
 */
const FILES = [
  'apps/api/src/modules/dashboard/dashboard.service.ts',
  'apps/api/src/modules/dashboard/dashboard-blocks.service.ts',
  'apps/api/src/modules/users/kpi/kpi-targets.service.ts',
];

// Tim repo root tu vi tri spec (apps/api/src/modules/dashboard/__tests__)
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

describe('SQL timezone conversion - 2-step AT TIME ZONE', () => {
  for (const file of FILES) {
    it(`${file}: khong con AT TIME ZONE 'Asia/Ho_Chi_Minh' dang 1 buoc`, () => {
      const source = readFileSync(join(REPO_ROOT, file), 'utf8');
      const offenders: string[] = [];

      const marker = "AT TIME ZONE 'Asia/Ho_Chi_Minh'";
      let idx = source.indexOf(marker);
      while (idx !== -1) {
        const before = source.slice(Math.max(0, idx - 60), idx);
        // Hop le khi ngay truoc do la ket thuc cua (col AT TIME ZONE 'UTC')
        // Bo qua dong comment giai thich (-- hoac //)
        const lineStart = source.lastIndexOf('\n', idx) + 1;
        const line = source.slice(lineStart, idx);
        const isComment = /^\s*(--|\/\/|\*)/.test(line);
        if (!isComment && !before.includes("AT TIME ZONE 'UTC')")) {
          offenders.push(source.slice(Math.max(0, idx - 50), idx + marker.length));
        }
        idx = source.indexOf(marker, idx + 1);
      }

      expect(offenders, `Dang 1 buoc con sot:\n${offenders.join('\n')}`).toEqual([]);
    });
  }
});
