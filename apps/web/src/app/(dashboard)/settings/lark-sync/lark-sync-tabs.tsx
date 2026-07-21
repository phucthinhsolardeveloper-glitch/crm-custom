'use client';

import { useState } from 'react';
import {
  LarkSyncClient,
  type LarkMappingItem,
  type LarkCatalogEntry,
  type LarkPreset,
} from './lark-sync-client';
import { LarkSyncHistoryTab } from './lark-sync-history-tab';

interface Props {
  initialMappings: LarkMappingItem[];
  catalog: LarkCatalogEntry[];
  presets: LarkPreset[];
}

type TabKey = 'config' | 'history';

/** Vo 2 tab cho trang Lark Sync: Cau hinh + Lich su dong bo. */
export function LarkSyncTabs({ initialMappings, catalog, presets }: Props) {
  const [tab, setTab] = useState<TabKey>('config');
  const channels = initialMappings.map((m) => ({ id: m.id, name: m.name }));

  const tabClass = (key: TabKey) =>
    `px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px ${
      tab === key
        ? 'border-sky-500 text-sky-600'
        : 'border-transparent text-slate-500 hover:text-slate-700'
    }`;

  return (
    <div className="space-y-5">
      <div className="flex gap-1 border-b border-slate-200">
        <button className={tabClass('config')} onClick={() => setTab('config')}>
          Cấu hình Lark Sync
        </button>
        <button className={tabClass('history')} onClick={() => setTab('history')}>
          Lịch sử đồng bộ
        </button>
      </div>

      {tab === 'config' ? (
        <LarkSyncClient initialMappings={initialMappings} catalog={catalog} presets={presets} />
      ) : (
        <LarkSyncHistoryTab channels={channels} />
      )}
    </div>
  );
}
