'use client';

import { useRef, useEffect, useState, useId, useMemo } from 'react';
import { useActions, useTeams, useTeamOrder } from '@/hooks/useTerritoryStore';
import { getTeamColor } from '@/lib/colorUtils';
import { flattenTreeForSelect } from '@/lib/teamTree';

interface AddTeamModalProps {
  onClose: () => void;
  /** If provided, pre-selects this team as the parent. */
  parentId?: string | null;
}

export default function AddTeamModal({ onClose, parentId: initialParentId = null }: AddTeamModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const [name, setName] = useState('');
  const teams = useTeams();
  const teamOrder = useTeamOrder();
  const [parentId, setParentId] = useState<string | null>(initialParentId);
  const [color, setColor] = useState(() => getTeamColor(teamOrder.length));
  const { addTeam } = useActions();

  const parentOptions = useMemo(() => flattenTreeForSelect(teams, teamOrder), [teams, teamOrder]);

  useEffect(() => { dialogRef.current?.showModal(); }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    addTeam(name.trim(), color, parentId);
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="add-team-title"
      className="m-auto w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl backdrop:bg-black/30 dark:border-slate-700 dark:bg-slate-900"
      onClose={onClose}
    >
      <h2 id="add-team-title" className="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-100">Add Team</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor={`${uid}-name`} className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400">
            Team Name
          </label>
          <input
            id={`${uid}-name`}
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. EMEA Sales"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <div>
          <label htmlFor={`${uid}-parent`} className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400">
            Parent Team
          </label>
          <select
            id={`${uid}-parent`}
            value={parentId ?? ''}
            onChange={(e) => setParentId(e.target.value || null)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">— root team —</option>
            {parentOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor={`${uid}-color`} className="text-sm font-medium text-slate-600 dark:text-slate-400">Color</label>
          <input
            id={`${uid}-color`}
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-8 w-14 cursor-pointer rounded-lg border border-slate-200"
          />
          <span className="text-xs text-slate-400">{color}</span>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Add Team
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
