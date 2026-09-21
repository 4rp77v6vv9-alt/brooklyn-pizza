const {contextBridge,ipcRenderer}=require('electron')
contextBridge.exposeInMainWorld('brooklynDesktop',{
  isDesktop:true,
  platform:process.platform,
  version:'20.31.48',
  getConfig:()=>ipcRenderer.invoke('config:get'),
  saveConfig:value=>ipcRenderer.invoke('config:set',value),
  openHardwareSettings:()=>ipcRenderer.invoke('settings:open'),
  minimize:()=>ipcRenderer.invoke('window:minimize'),
  close:()=>ipcRenderer.invoke('window:close'),
  hardwareStatus:()=>ipcRenderer.invoke('hardware:status'),
  hardwareCommand:(channel,payload)=>ipcRenderer.invoke('hardware:command',{channel,payload})
})
