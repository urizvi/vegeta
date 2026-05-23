'use client';

import { useRef, useEffect, useState, useId } from 'react';
import {
  useActions,
  useHierarchyLevels,
  useHierarchyLevelOrder,
} from '@/hooks/useTerritoryStore';

interface AddMemberModalProps {
  teamId: string;
  onClose: () => void;
}

export default function AddMemberModal({ teamId, onClose }: AddMemberModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const levels = useHierarchyLevels();
  const levelOrder = useHierarchyLevelOrder();
  const [level, setLevel] = useState<string>(levelOrder[0] ?? '');
  const { addMember } = useActions();

  useEffect(() => { dialogRef.current?.showModal(); }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    addMember(teamId, { name: name.trim(), email: email.trim(), role: role.trim(), level });
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="add-member-title"
      className="m-auto w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl backdrop:bg-black/30 dark:border-slate-700 dark:bg-slate-900"
      onClose={onClose}
    >
      <h2 id="add-member-title" className="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-100">Add Member</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label htmlFor={`${uid}-name`} className="mb-1 block text-xs font-medium text-slate-500">Full Name *</label>
          <input
            id={`${uid}-name`}
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <div>
          <label htmlFor={`${uid}-email`} className="mb-1 block text-xs font-medium text-slate-500">Email *</label>
          <input
            id={`${uid}-email`}
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@company.com"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <div>
          <label htmlFor={`${uid}-role`} className="mb-1 block text-xs font-medium text-slate-500">Role / Title</label>
          <input
            id={`${uid}-role`}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Account Executive"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <div>
          <label htmlFor={`${uid}-level`} className="mb-1 block text-xs font-medium text-slate-500">Level</label>
          <select
            id={`${uid}-level`}
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            disabled={levelOrder.length === 0}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 disabled:opacity-50"
          >
            {levelOrder.length === 0 ? (
              <option value="">No levels defined — add one in Manage Levels</option>
            ) : (
              levelOrder.map((id) => (
                <option key={id} value={id}>{levels[id]?.label ?? id}</option>
              ))
            )}
          </select>
        </div>
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Add Member
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
