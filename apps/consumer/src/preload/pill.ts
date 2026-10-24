import { contextBridge, ipcRenderer } from 'electron';
import type { PillAction, PillNudge } from '../main/coach/types';
import type { IslandRest } from '../main/windows/pill';

const api = {
  onShow: (cb: (n: PillNudge) => void): void => { ipcRenderer.on('pill:show', (_e, n: PillNudge) => cb(n)); },
  onDismissAll: (cb: () => void): void => { ipcRenderer.on('pill:dismissAll', () => cb()); },
  onAnswer: (cb: (a: { id: number; text: string }) => void): void => { ipcRenderer.on('pill:answer', (_e, a: { id: number; text: string }) => cb(a)); },
  ask: (id: number, q: string): void => ipcRenderer.send('pill:msg', { type: 'ask', id, q }),
  onRest: (cb: (r: IslandRest | null) => void): void => { ipcRenderer.on('pill:rest', (_e, r: IslandRest | null) => cb(r)); },
  hover: (hover: boolean): void => ipcRenderer.send('pill:msg', { type: 'hover', hover }),
  action: (id: number, action: PillAction): void => ipcRenderer.send('pill:msg', { type: 'action', id, action }),
  empty: (): void => ipcRenderer.send('pill:msg', { type: 'empty' })
};
export type PillApi = typeof api;
contextBridge.exposeInMainWorld('pill', api);
