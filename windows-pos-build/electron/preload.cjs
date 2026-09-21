const {contextBridge,ipcRenderer}=require('electron')
contextBridge.exposeInMainWorld('brooklynDesktop',{
  isDesktop:true,
  platform:process.platform,
  version:'20.31.49',
  getConfig:()=>ipcRenderer.invoke('config:get'),
  saveConfig:value=>ipcRenderer.invoke('config:set',value),
  openHardwareSettings:()=>ipcRenderer.invoke('settings:open'),
  toggleFullscreen:()=>ipcRenderer.invoke('window:toggleFullscreen'),
  minimize:()=>ipcRenderer.invoke('window:minimize'),
  maximize:()=>ipcRenderer.invoke('window:maximize'),
  close:()=>ipcRenderer.invoke('window:close'),
  reloadPos:()=>ipcRenderer.invoke('pos:reload'),
  hardwareStatus:()=>ipcRenderer.invoke('hardware:status'),
  hardwareCommand:(channel,payload)=>ipcRenderer.invoke('hardware:command',{channel,payload}),
  onPosState:callback=>{const fn=(_e,state)=>callback(state);ipcRenderer.on('pos:state',fn);return()=>ipcRenderer.removeListener('pos:state',fn)},
  onFullscreen:callback=>{const fn=(_e,value)=>callback(value);ipcRenderer.on('window:fullscreen',fn);return()=>ipcRenderer.removeListener('window:fullscreen',fn)}
})
