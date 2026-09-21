const {contextBridge,ipcRenderer}=require('electron')
contextBridge.exposeInMainWorld('brooklynDesktop',{
  isDesktop:true,
  platform:process.platform,
  version:'20.31.48',
  getConfig:()=>ipcRenderer.invoke('config:get'),
  saveConfig:value=>ipcRenderer.invoke('config:set',value),
  openHardwareSettings:()=>ipcRenderer.invoke('settings:open'),
  openServerSettings:()=>ipcRenderer.invoke('server:settings'),
  toggleFullscreen:()=>ipcRenderer.invoke('window:toggleFullscreen'),
  minimize:()=>ipcRenderer.invoke('window:minimize'),
  toggleMaximize:()=>ipcRenderer.invoke('window:toggleMaximize'),
  close:()=>ipcRenderer.invoke('window:close'),
  reloadPos:()=>ipcRenderer.invoke('pos:reload'),
  hardwareStatus:()=>ipcRenderer.invoke('hardware:status'),
  hardwareCommand:(channel,payload)=>ipcRenderer.invoke('hardware:command',{channel,payload})
})
