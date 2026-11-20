'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const handler = (_event, payload) => callback(payload || {});
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('clipdeck', {
  isElectron: true,
  getState: () => invoke('state:get'),
  list: () => invoke('clips:list'),
  copy: (id) => invoke('clips:copy', String(id)),
  pin: (id) => invoke('clips:pin', String(id)),
  remove: (id) => invoke('clips:remove', String(id)),
  clear: () => invoke('clips:clear'),
  setPaused: (paused) => invoke('watch:set', Boolean(paused)),
  setLaunchAtLogin: (enabled) => invoke('settings:launchAtLogin', Boolean(enabled)),
  getUpdateState: () => invoke('updates:get'),
  checkForUpdates: () => invoke('updates:check'),
  downloadUpdate: () => invoke('updates:download'),
  installUpdate: () => invoke('updates:install'),
  hide: () => ipcRenderer.send('panel:hide'),
  concealed: () => ipcRenderer.send('panel:concealed'),
  pointer: (inside) => ipcRenderer.send('panel:pointer', Boolean(inside)),
  onReveal: (callback) => subscribe('panel:reveal', callback),
  onConceal: (callback) => subscribe('panel:conceal', callback),
  onUpdate: (callback) => subscribe('clips:updated', callback),
  onState: (callback) => subscribe('state:changed', callback),
  onUpdateState: (callback) => subscribe('updates:state', callback),
});
