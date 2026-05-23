'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  useActions,
  usePipelineStages,
  usePipelineStageOrder,
  useFieldDefs,
} from '@/hooks/useTerritoryStore';
import type { Account } from '@/types/account';
import type { Member, SalesTeam } from '@/types/territory';
import type { FieldDefinition } from '@/lib/accountFields';

const UNSTAGED = '__unstaged__';
const GROUP_BY_STAGE = '__stage__';

// ---------------------------------------------------------------------------
// Eligibility helpers
// ---------------------------------------------------------------------------

function isEligibleGroupField(def: FieldDefinition, accounts: Account[]): boolean {
  if (def.type === 'categorical') return true;
  if (def.type === 'computed' && def.outputType === 'text') {
    const distinct = new Set<string>();
    for (const a of accounts) {
      const v = a.fields[def.id];
      if (typeof v === 'string' && v !== '') distinct.add(v);
      if (distinct.size > 12) return false;
    }
    return true;
  }
  return false;
}

function distinctTextValues(def: FieldDefinition, accounts: Account[]): string[] {
  const seen = new Set<string>();
  for (const a of accounts) {
    const v = a.fields[def.id];
    if (typeof v === 'string' && v !== '') seen.add(v);
  }
  return [...seen].sort();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  accounts: Account[];
  members: Record<string, Member>;
  teams: Record<string, SalesTeam>;
  onEdit: (id: string) => void;
}

export default function KanbanBoard({ accounts, members, teams, onEdit }: Props) {
  const stages = usePipelineStages();
  const stageOrder = usePipelineStageOrder();
  const fieldDefs = useFieldDefs();
  const { updateAccount } = useActions();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const [groupBy, setGroupBy] = useState<string>(GROUP_BY_STAGE);

  // Fields that can appear in the Group-by dropdown
  const eligibleGroupFields = useMemo(
    () => fieldDefs.filter((def) => isEligibleGroupField(def, accounts)),
    [fieldDefs, accounts],
  );

  // Is the current grouping driven by a computed field?
  const groupByDef = useMemo(
    () => (groupBy === GROUP_BY_STAGE ? null : fieldDefs.find((d) => d.id === groupBy) ?? null),
    [groupBy, fieldDefs],
  );
  const isComputedGrouping = groupByDef?.type === 'computed';

  // ---------------------------------------------------------------------------
  // Build columns
  // ---------------------------------------------------------------------------
  const { columns, accountsByCol } = useMemo(() => {
    if (groupBy === GROUP_BY_STAGE) {
      // Pipeline-stage grouping (original behaviour)
      const cols: Array<{ id: string; label: string; color: string }> = [
        ...stageOrder.map((sid) => ({
          id: sid,
          label: stages[sid]?.label ?? sid,
          color: stages[sid]?.color ?? '#e5e7eb',
        })),
        { id: UNSTAGED, label: 'Unstaged', color: '#f4f4f5' },
      ];

      const byCol: Record<string, Account[]> = { [UNSTAGED]: [] };
      for (const sid of stageOrder) byCol[sid] = [];
      for (const a of accounts) {
        const key = a.stageId && byCol[a.stageId] !== undefined ? a.stageId : UNSTAGED;
        byCol[key].push(a);
      }
      return { columns: cols, accountsByCol: byCol };
    }

    // Field-based grouping
    const def = fieldDefs.find((d) => d.id === groupBy);
    if (!def) {
      return { columns: [], accountsByCol: {} };
    }

    const values: string[] =
      def.type === 'computed'
        ? distinctTextValues(def, accounts)
        : (def.options ?? []);

    const cols: Array<{ id: string; label: string; color: string }> = [
      ...values.map((v) => ({ id: v, label: v, color: '#e5e7eb' })),
      { id: UNSTAGED, label: '—', color: '#f4f4f5' },
    ];

    const byCol: Record<string, Account[]> = { [UNSTAGED]: [] };
    for (const v of values) byCol[v] = [];
    for (const a of accounts) {
      const raw = a.fields[def.id];
      const val = typeof raw === 'string' && raw !== '' ? raw : null;
      const key = val && byCol[val] !== undefined ? val : UNSTAGED;
      byCol[key].push(a);
    }
    return { columns: cols, accountsByCol: byCol };
  }, [groupBy, accounts, stageOrder, stages, fieldDefs]);

  // ---------------------------------------------------------------------------
  // Drag handler
  // ---------------------------------------------------------------------------
  function handleDragEnd(e: DragEndEvent) {
    if (isComputedGrouping) return; // drag disabled for computed groupings

    const { active, over } = e;
    if (!over) return;
    const accountId = String(active.id);
    const targetStage = String(over.id);

    if (groupBy === GROUP_BY_STAGE) {
      if (targetStage === UNSTAGED) {
        updateAccount(accountId, { stageId: null });
        return;
      }
      if (!stages[targetStage]) return;
      const account = accounts.find((a) => a.id === accountId);
      if (!account || account.stageId === targetStage) return;
      updateAccount(accountId, { stageId: targetStage });
    }
    // For categorical field grouping: drag-to-move is not implemented (would require field mutation)
  }

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------
  if (groupBy === GROUP_BY_STAGE && stageOrder.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <div>
          <p className="text-sm text-slate-500">No pipeline stages defined.</p>
          <p className="text-xs text-slate-400">Click &quot;Stages&quot; in the toolbar to add some.</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Group-by toolbar */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 text-xs dark:border-slate-700 dark:bg-slate-950">
        <span className="font-medium text-slate-500 dark:text-slate-400">Group by</span>
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value)}
          className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <option value={GROUP_BY_STAGE}>Pipeline stage</option>
          {eligibleGroupFields.map((def) => (
            <option key={def.id} value={def.id}>{def.label}</option>
          ))}
        </select>
      </div>

      {/* Computed-grouping banner */}
      {isComputedGrouping && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          Grouped by a computed field — cards reflect data, drag to reorder is disabled.
        </div>
      )}

      {/* Board */}
      <div className="flex-1 overflow-auto p-4">
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex h-full gap-3">
            {columns.map((col) => (
              <KanbanColumn key={col.id} {...col} count={accountsByCol[col.id]?.length ?? 0}>
                {(accountsByCol[col.id] ?? []).map((a) => {
                  const rep = a.repId ? members[a.repId] : null;
                  const team = a.repId
                    ? Object.values(teams).find((t) => t.memberIds.includes(a.repId as string))
                    : null;
                  return (
                    <KanbanCard
                      key={a.id}
                      accountId={a.id}
                      name={a.name}
                      repName={rep?.name}
                      teamName={team?.name}
                      teamColor={team?.color}
                      dragDisabled={isComputedGrouping ?? false}
                      onEdit={() => onEdit(a.id)}
                    />
                  );
                })}
              </KanbanColumn>
            ))}
          </div>
        </DndContext>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KanbanColumn({
  id,
  label,
  color,
  count,
  children,
}: {
  id: string;
  label: string;
  color: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 flex-shrink-0 flex-col rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900 ${isOver ? 'ring-2 ring-indigo-400' : ''}`}
    >
      <div
        className="flex items-center gap-2 rounded-t-xl border-b border-slate-200 px-3 py-2 dark:border-slate-700"
        style={{ backgroundColor: color }}
      >
        <span className="text-xs font-semibold text-slate-800">{label}</span>
        <span className="ml-auto rounded-full bg-black/15 px-1.5 py-0.5 text-[10px] font-semibold text-slate-800">
          {count}
        </span>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto p-2">
        {children}
      </div>
    </div>
  );
}

function KanbanCard({
  accountId,
  name,
  repName,
  teamName,
  teamColor,
  dragDisabled,
  onEdit,
}: {
  accountId: string;
  name: string;
  repName?: string;
  teamName?: string;
  teamColor?: string;
  dragDisabled: boolean;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: accountId });
  const style: React.CSSProperties = {
    ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}),
    ...(dragDisabled ? { cursor: 'not-allowed' } : {}),
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(dragDisabled ? {} : listeners)}
      {...(dragDisabled ? {} : attributes)}
      className={`rounded-lg border border-slate-200 bg-white p-2 shadow-sm hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 ${!dragDisabled ? 'cursor-grab active:cursor-grabbing' : ''} ${isDragging ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        className="block w-full truncate text-left text-sm font-medium text-slate-800 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400"
        title={name}
      >
        {name}
      </button>
      {(repName || teamName) && (
        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
          {teamColor && (
            <span
              className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
              style={{ backgroundColor: teamColor }}
            />
          )}
          <span className="truncate">{repName ?? '—'}{teamName ? ` · ${teamName}` : ''}</span>
        </div>
      )}
    </div>
  );
}
