const {contextBridge,ipcRenderer}=require('electron')
contextBridge.exposeInMainWorld('brooklynDesktop',{
  isDesktop:true,
  platform:process.platform,
  version:'20.31.47',
  getConfig:()=>ipcRenderer.invoke('config:get'),
  saveConfig:value=>ipcRenderer.invoke('config:set',value),
  openHardwareSettings:()=>ipcRenderer.invoke('settings:open'),
  toggleFullscreen:()=>ipcRenderer.invoke('window:toggleFullscreen'),
  hardwareStatus:()=>ipcRenderer.invoke('hardware:status'),
  hardwareCommand:(channel,payload)=>ipcRenderer.invoke('hardware:command',{channel,payload})
})
