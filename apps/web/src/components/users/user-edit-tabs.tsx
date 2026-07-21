'use client';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { UserForm } from '@/components/users/user-form';
import { UserPhonesPanel } from '@/components/user-phones/user-phones-panel';
import { SipConfigForm } from '@/components/users/sip-config-form';
import { UserKpiTab } from '@/components/users/user-kpi-tab';
import type { UserRecord, NamedEntity } from '@/types/entities';

interface Props {
  user: UserRecord;
  departments: NamedEntity[];
  levels: NamedEntity[];
  /** Chỉ super_admin mới thấy tab "SĐT phụ trách" */
  showPhonesTab: boolean;
  /** Chỉ super_admin mới thấy tab "KPI" (set chỉ tiêu doanh số). */
  showKpiTab: boolean;
  allUsers: UserRecord[];
  /** Role của người đang đăng nhập - để form filter option role. */
  currentUserRole?: string;
}

export function UserEditTabs({
  user,
  departments,
  levels,
  showPhonesTab,
  showKpiTab,
  allUsers,
  currentUserRole,
}: Props) {
  if (!showPhonesTab && !showKpiTab) {
    return (
      <UserForm
        user={user}
        departments={departments}
        levels={levels}
        currentUserRole={currentUserRole}
      />
    );
  }

  return (
    <Tabs defaultValue="info" className="w-full">
      <TabsList>
        <TabsTrigger value="info">Thông tin chung</TabsTrigger>
        {showPhonesTab && <TabsTrigger value="phones">SĐT phụ trách</TabsTrigger>}
        {showPhonesTab && <TabsTrigger value="sip">SIP / Tổng đài</TabsTrigger>}
        {showKpiTab && <TabsTrigger value="kpi">KPI</TabsTrigger>}
      </TabsList>
      <TabsContent value="info">
        <UserForm
          user={user}
          departments={departments}
          levels={levels}
          currentUserRole={currentUserRole}
        />
      </TabsContent>
      {showPhonesTab && (
        <TabsContent value="phones">
          <UserPhonesPanel userId={String(user.id)} userName={user.name} allUsers={allUsers} />
        </TabsContent>
      )}
      {showPhonesTab && (
        <TabsContent value="sip">
          <SipConfigForm userId={String(user.id)} userName={user.name} />
        </TabsContent>
      )}
      {showKpiTab && (
        <TabsContent value="kpi">
          <UserKpiTab userId={String(user.id)} userName={user.name} />
        </TabsContent>
      )}
    </Tabs>
  );
}
