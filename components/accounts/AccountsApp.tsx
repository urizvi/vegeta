'use client';

import { useState, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTerritoryStore } from '@/store/territoryStore';
import AccountsToolbar from './AccountsToolbar';
import AccountsTable from './AccountsTable';
import AddEditAccountModal from './AddEditAccountModal';
import AccountsImportModal from './AccountsImportModal';
import ManageFieldsModal from './ManageFieldsModal';
import type { Account } from '@/types/account';

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

  const [search,     setSearch]     = useState('');
  const [filters,    setFilters]    = useState<Record<string, string>>({});
  const [showAdd,    setShowAdd]    = useState(false);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showManage, setShowManage] = useState(false);

  const filtered = useMemo(() => {
    return accountOrder
      .map((id) => accounts[id])
      .filter(Boolean)
      .filter((a): a is Account => {
        if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
        for (const [fieldId, val] of Object.entries(filters)) {
          if (val && a.fields[fieldId] !== val) return false;
        }
        return true;
      });
  }, [accountOrder, accounts, search, filters]);

  const editingAccount = editingId ? accounts[editingId] : undefined;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white dark:bg-zinc-950">
      <AccountsToolbar
        search={search}
        filters={filters}
        totalCount={filtered.length}
        onSearch={setSearch}
        onFilter={(patch) => setFilters((f) => ({ ...f, ...patch }))}
        onClearFilters={() => setFilters({})}
        onAdd={() => setShowAdd(true)}
        onImport={() => setShowImport(true)}
        onManageFields={() => setShowManage(true)}
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        <AccountsTable
          accounts={filtered}
          members={members}
          teams={teams}
          teamOrder={teamOrder}
          onEdit={(id) => setEditingId(id)}
        />
      </main>

      {showAdd && (
        <AddEditAccountModal onClose={() => setShowAdd(false)} />
      )}
      {editingAccount && (
        <AddEditAccountModal account={editingAccount} onClose={() => setEditingId(null)} />
      )}
      {showImport && (
        <AccountsImportModal onClose={() => setShowImport(false)} />
      )}
      {showManage && (
        <ManageFieldsModal onClose={() => setShowManage(false)} />
      )}
    </div>
  );
}
