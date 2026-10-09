import React from 'react';
import { createRoot } from 'react-dom/client';
import { view } from '@forge/bridge';
import DeadlinePanel from './panel/DeadlinePanel';
import ProjectSettings from './settings/ProjectSettings';
import './App.css';

async function start() {
  const context = await view.getContext();
  // Enable Atlassian design tokens (light/dark) before the first render
  await view.theme.enable().catch(() => {});

  const Module = context.moduleKey === 'time-left-settings' ? ProjectSettings : DeadlinePanel;
  createRoot(document.getElementById('root')).render(<Module context={context} />);
}

start();
