const path=require('path')
const {app,BrowserWindow,ipcMain,shell,session}=require('electron')
const config=require('./config.cjs')
const hardware=require('./hardware.cjs')

let win,settingsWin
function normalizeServer(raw){const value=String(raw||'').trim().replace(/\/$/,'');if(!value)return '';try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol))return '';return u.toString().replace(/\/$/,'')}catch{return ''}}
async function loadPos(){const c=config.read(),server=normalizeServer(c.serverUrl);if(!server)return win.loadFile(path.join(__dirname,'../renderer/setup.html'));const target=server+'/pos';await win.loadURL(target);if(c.fullscreen)win.setFullScreen(true)}
function windowOptions(extra={}){return {width:1440,height:900,minWidth:1100,minHeight:700,show:false,autoHideMenuBar:true,backgroundColor:'#111111',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,partition:'persist:brooklyn-pos'},...extra}}
function createWindow(){
  win=new BrowserWindow(windowOptions({title:'Brooklyn Pizza POS'}))
  win.once('ready-to-show',()=>win.show())
  win.webContents.setWindowOpenHandler(({url})=>{try{const current=config.read().serverUrl;if(current&&url.startsWith(current))return {action:'allow'};void shell.openExternal(url)}catch{}return {action:'deny'}})
  win.webContents.on('will-navigate',(event,url)=>{const c=config.read(),server=normalizeServer(c.serverUrl);if(!server)return;if(url.startsWith(server))return;event.preventDefault();void shell.openExternal(url)})
  void loadPos()
}
function openSettings(){
  if(settingsWin&&!settingsWin.isDestroyed()){settingsWin.focus();return true}
  settingsWin=new BrowserWindow(windowOptions({parent:win,modal:true,width:920,height:780,minWidth:760,minHeight:620,title:'Brooklyn Pizza POS — оборудование'}))
  settingsWin.once('ready-to-show',()=>settingsWin.show());settingsWin.on('closed',()=>{settingsWin=null});void settingsWin.loadFile(path.join(__dirname,'../renderer/settings.html'));return true
}
function isLocal(event){return String(event?.senderFrame?.url||'').startsWith('file://')}
app.whenReady().then(()=>{session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()})})
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()})

ipcMain.handle('config:get',(event)=>isLocal(event)?config.read():config.publicView())
ipcMain.handle('config:set',async(event,value)=>{if(!isLocal(event))return {ok:false,error:'Настройки оборудования изменяются только в локальном окне Windows POS'};try{const server=normalizeServer(value?.serverUrl);if(!server)return {ok:false,error:'Укажите полный адрес сервера, например https://pizza.example'};const previous=config.read();config.write({...value,serverUrl:server});if(previous.serverUrl!==server&&win&&!win.isDestroyed())await loadPos();return {ok:true}}catch(e){return {ok:false,error:e.message}}})
ipcMain.handle('settings:open',()=>openSettings())
ipcMain.handle('window:toggleFullscreen',()=>{if(!win)return false;win.setFullScreen(!win.isFullScreen());return win.isFullScreen()})
ipcMain.handle('hardware:status',()=>hardware.status())
ipcMain.handle('hardware:command',(_event,{channel,payload})=>hardware.command(String(channel||''),payload))
