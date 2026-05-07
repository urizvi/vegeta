'use client';

import { useMemo } from 'react';
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
} from '@/hooks/useTerritoryStore';
import type { Account } from '@/types/account';
import type { Member, SalesTeam } from '@/types/territory';

const UNSTAGED = '__unstaged__';

interface Props {
  accounts: Account[];
  members: Record<string, Member>;
  teams: Record<string, SalesTeam>;
  onEdit: (id: string) => void;
}

export default function KanbanBoard({ accounts, members, teams, onEdit }: Props) {
  const stages = usePipelineStages();
  const stageOrder = usePipelineStageOrder();
  const { updateAccount } = useActions();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const accountsByStage = useMemo(() => {
    const out: Record<string, Account[]> = { [UNSTAGED]: [] };
    for (const sid of stageOrder) out[sid] = [];
    for (const a of accounts) {
      const key = a.stageId && out[a.stageId] !== undefined ? a.stageId : UNSTAGED;
      out[key].push(a);
    }
    return out;
  }, [accounts, stageOrder]);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const accountId = String(active.id);
    const targetStage = String(over.id);
    if (targetStage === UNSTAGED) {
      // Drop on the unstaged column → null out the stage.
      updateAccount(accountId, { stageId: null });
      return;
    }
    if (!stages[targetStage]) return;
    const account = accounts.find((a) => a.id === accountId);
    if (!account || account.stageId === targetStage) return;
    updateAccount(accountId, { stageId: targetStage });
  }

  const columns: Array<{ id: string; label: string; color: string }> = [
    ...stageOrder.map((sid) => ({
      id: sid,
      label: stages[sid]?.label ?? sid,
      color: stages[sid]?.color ?? '#e5e7eb',
    })),
    { id: UNSTAGED, label: 'Unstaged', color: '#f4f4f5' },
  ];

  if (stageOrder.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <div>
          <p className="text-sm text-slate-500">No pipeline stages defined.</p>
          <p className="text-xs text-slate-400">Click &quot;Stages&quot; in the toolbar to add some.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex h-full gap-3">
          {columns.map((col) => (
            <KanbanColumn key={col.id} {...col} count={accountsByStage[col.id]?.length ?? 0}>
              {(accountsByStage[col.id] ?? []).map((a) => {
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
                    onEdit={() => onEdit(a.id)}
                  />
                );
              })}
            </KanbanColumn>
          ))}
        </div>
      </DndContext>
    </div>
  );
}

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
  onEdit,
}: {
  accountId: string;
  name: string;
  repName?: string;
  teamName?: string;
  teamColor?: string;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: accountId });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`cursor-grab rounded-lg border border-slate-200 bg-white p-2 shadow-sm hover:border-slate-300 active:cursor-grabbing dark:border-slate-700 dark:bg-slate-800 ${isDragging ? 'opacity-50' : ''}`}
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
