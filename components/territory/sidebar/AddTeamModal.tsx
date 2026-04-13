'use client';

import { useRef, useEffect, useState } from 'react';
import { useActions } from '@/hooks/useTerritoryStore';
import { getTeamColor } from '@/lib/colorUtils';
import { useTeamOrder } from '@/hooks/useTerritoryStore';

interface AddTeamModalProps {
  onClose: () => void;
}

export default function AddTeamModal({ onClose }: AddTeamModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const teamCount = useTeamOrder().length;
  const { addTeam } = useActions();

  useEffect(() => {
    setColor(getTeamColor(teamCount));
    dialogRef.current?.showModal();
  }, [teamCount]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    addTeam(name.trim(), color);
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl backdrop:bg-black/30 dark:border-zinc-700 dark:bg-zinc-900"
      onClose={onClose}
    >
      <h2 className="mb-4 text-lg font-semibold text-zinc-800 dark:text-zinc-100">Add Team</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Team Name
          </label>
          <input
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. EMEA Sales"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Color</label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-8 w-14 cursor-pointer rounded-lg border border-zinc-200"
          />
          <span className="text-xs text-zinc-400">{color}</span>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add Team
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-zinc-200 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
