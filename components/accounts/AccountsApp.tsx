'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useShallow } from 'zustand/react/shallow';
import { useTerritoryStore } from '@/store/territoryStore';
import AccountsToolbar from './AccountsToolbar';
import AccountsTable from './AccountsTable';
import KanbanBoard from './KanbanBoard';
import AddEditAccountModal from './AddEditAccountModal';
import AccountsImportModal from './AccountsImportModal';
import ManageFieldsModal from './ManageFieldsModal';
import ManageStagesModal from './ManageStagesModal';
import type { Account } from '@/types/account';

type ViewMode = 'table' | 'kanban';

export default function AccountsApp() {
  const { accounts, accountOrder, members, teams, teamOrder } = useTerritoryStore(
    useShallow((s) => ({
      accounts:     s.accounts,
      accountOrder: s.accountOrder,
      members:      s.members,
      teams:        s.teams,
      teamOrder:    s.teamOrder,
    })),
  );

  const router = useRouter();
  const [search,           setSearch]           = useState('');
  const [filters,          setFilters]          = useState<Record<string, string>>({});
  const [view,             setView]             = useState<ViewMode>('table');
  const [showAdd,          setShowAdd]          = useState(false);
  const [showImport,       setShowImport]       = useState(false);
  const [showManage,       setShowManage]       = useState(false);
  const [showManageStages, setShowManageStages] = useState(false);

  const openDetail = (id: string) => router.push(`/accounts/${encodeURIComponent(id)}`);

  const allAccounts = useMemo(
    () => accountOrder.map((id) => accounts[id]).filter(Boolean) as Account[],
    [accountOrder, accounts],
  );

  const filtered = useMemo(() => {
    return allAccounts.filter((a): a is Account => {
      if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
      for (const [fieldId, val] of Object.entries(filters)) {
        if (val && a.fields[fieldId] !== val) return false;
      }
      return true;
    });
  }, [allAccounts, search, filters]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      <AccountsToolbar
        search={search}
        filters={filters}
        totalCount={filtered.length}
        view={view}
        accounts={allAccounts}
        onView={setView}
        onSearch={setSearch}
        onFilter={(patch) => setFilters((f) => ({ ...f, ...patch }))}
        onClearFilters={() => setFilters({})}
        onAdd={() => setShowAdd(true)}
        onImport={() => setShowImport(true)}
        onManageFields={() => setShowManage(true)}
        onManageStages={() => setShowManageStages(true)}
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        {view === 'table' ? (
          <AccountsTable
            accounts={filtered}
            members={members}
            teams={teams}
            teamOrder={teamOrder}
            onEdit={openDetail}
          />
        ) : (
          <KanbanBoard
            accounts={filtered}
            members={members}
            teams={teams}
            onEdit={openDetail}
          />
        )}
      </main>

      {showAdd && (
        <AddEditAccountModal onClose={() => setShowAdd(false)} />
      )}
      {showImport && (
        <AccountsImportModal onClose={() => setShowImport(false)} />
      )}
      {showManage && (
        <ManageFieldsModal onClose={() => setShowManage(false)} />
      )}
      {showManageStages && (
        <ManageStagesModal onClose={() => setShowManageStages(false)} />
      )}
    </div>
  );
}
