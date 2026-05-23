import type { Metadata } from 'next';
import SettingsWorkspaceClient from './SettingsWorkspaceClient';

export const metadata: Metadata = {
  title: 'Workspace settings',
};

export default function SettingsWorkspacePage() {
  return <SettingsWorkspaceClient />;
}
