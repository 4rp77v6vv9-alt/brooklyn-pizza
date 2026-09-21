const path=require('path')
const {app,BrowserWindow,BrowserView,ipcMain,shell,session}=require('electron')
const config=require('./config.cjs')
const hardware=require('./hardware.cjs')

const TOOLBAR_HEIGHT=58
let win,settingsWin,setupWin,posView

function normalizeServer(raw){
  const value=String(raw||'').trim().replace(/\/$/,'')
  if(!value)return ''
  try{
    const u=new URL(value)
    if(!['https:','http:'].includes(u.protocol))return ''
    return u.toString().replace(/\/$/,'')
  }catch{return ''}
}
function localWindowOptions(extra={}){
  return {
    width:920,height:780,minWidth:680,minHeight:520,show:false,
    autoHideMenuBar:true,backgroundColor:'#111111',
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,partition:'persist:brooklyn-pos'},
    ...extra
  }
}
function positionPosView(){
  if(!win||win.isDestroyed()||!posView)return
  const [width,height]=win.getContentSize()
  posView.setBounds({x:0,y:TOOLBAR_HEIGHT,width:Math.max(0,width),height:Math.max(0,height-TOOLBAR_HEIGHT)})
}
function wirePosNavigation(view,server){
  view.webContents.setWindowOpenHandler(({url})=>{
    if(url.startsWith(server))return {action:'allow'}
    void shell.openExternal(url)
    return {action:'deny'}
  })
  view.webContents.on('will-navigate',(event,url)=>{
    if(url.startsWith(server))return
    event.preventDefault()
    void shell.openExternal(url)
  })
  view.webContents.on('before-input-event',(event,input)=>{
    if(input.type==='keyDown'&&input.key==='F11'){event.preventDefault();toggleFullscreen()}
    if(input.type==='keyDown'&&input.control&&input.key.toLowerCase()==='r'){event.preventDefault();void reloadPos()}
  })
}
async function loadPos(){
  const c=config.read(),server=normalizeServer(c.serverUrl)
  if(!server){
    if(posView&&win){win.removeBrowserView(posView);posView.webContents.close();posView=null}
    openServerSettings()
    return false
  }
  if(posView&&win){
    win.removeBrowserView(posView)
    posView.webContents.close()
    posView=null
  }
  posView=new BrowserView({
    webPreferences:{
      preload:path.join(__dirname,'preload.cjs'),
      contextIsolation:true,nodeIntegration:false,sandbox:true,
      partition:'persist:brooklyn-pos'
    }
  })
  win.addBrowserView(posView)
  positionPosView()
  wirePosNavigation(posView,server)
  await posView.webContents.loadURL(server+'/pos')
  return true
}
async function reloadPos(){
  if(posView&&!posView.webContents.isDestroyed()){posView.webContents.reload();return true}
  return loadPos()
}
function toggleFullscreen(){
  if(!win||win.isDestroyed())return false
  win.setFullScreen(!win.isFullScreen())
  setTimeout(positionPosView,30)
  return win.isFullScreen()
}
function createWindow(){
  win=new BrowserWindow({
    width:1440,height:900,minWidth:1050,minHeight:680,show:false,
    frame:false,backgroundColor:'#111111',
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,partition:'persist:brooklyn-pos'},
    title:'Brooklyn Pizza POS'
  })
  win.loadFile(path.join(__dirname,'../renderer/shell.html'))
  win.once('ready-to-show',()=>{
    win.show()
    win.maximize()
    setTimeout(positionPosView,50)
  })
  win.on('resize',positionPosView)
  win.on('maximize',positionPosView)
  win.on('unmaximize',positionPosView)
  win.on('enter-full-screen',positionPosView)
  win.on('leave-full-screen',positionPosView)
  win.on('closed',()=>{win=null;posView=null})
  win.webContents.on('before-input-event',(event,input)=>{
    if(input.type==='keyDown'&&input.key==='F11'){event.preventDefault();toggleFullscreen()}
  })
  void loadPos()
}
function openSettings(){
  if(settingsWin&&!settingsWin.isDestroyed()){settingsWin.focus();return true}
  settingsWin=new BrowserWindow(localWindowOptions({parent:win,modal:true,title:'Brooklyn Pizza POS — оборудование'}))
  settingsWin.once('ready-to-show',()=>settingsWin.show())
  settingsWin.on('closed',()=>{settingsWin=null})
  void settingsWin.loadFile(path.join(__dirname,'../renderer/settings.html'))
  return true
}
function openServerSettings(){
  if(setupWin&&!setupWin.isDestroyed()){setupWin.focus();return true}
  setupWin=new BrowserWindow(localWindowOptions({parent:win,modal:true,width:620,height:560,minWidth:520,minHeight:460,title:'Brooklyn Pizza POS — подключение'}))
  setupWin.once('ready-to-show',()=>setupWin.show())
  setupWin.on('closed',()=>{setupWin=null})
  void setupWin.loadFile(path.join(__dirname,'../renderer/setup.html'))
  return true
}
function isLocal(event){return String(event?.senderFrame?.url||'').startsWith('file://')}

app.whenReady().then(()=>{
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false))
  createWindow()
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()})
})
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()})

ipcMain.handle('config:get',(event)=>isLocal(event)?config.read():config.publicView())
ipcMain.handle('config:set',async(event,value)=>{
  if(!isLocal(event))return {ok:false,error:'Настройки изменяются только в локальном окне Windows POS'}
  try{
    const server=normalizeServer(value?.serverUrl)
    if(!server)return {ok:false,error:'Укажите полный адрес сайта, например https://ваш-домен.ru'}
    const previous=config.read()
    config.write({...value,serverUrl:server,fullscreen:false})
    if(previous.serverUrl!==server||!posView)await loadPos()
    if(setupWin&&!setupWin.isDestroyed())setupWin.close()
    return {ok:true}
  }catch(e){return {ok:false,error:e.message}}
})
ipcMain.handle('settings:open',()=>openSettings())
ipcMain.handle('server:settings',()=>openServerSettings())
ipcMain.handle('window:toggleFullscreen',()=>toggleFullscreen())
ipcMain.handle('window:minimize',()=>{if(win&&!win.isDestroyed())win.minimize();return true})
ipcMain.handle('window:toggleMaximize',()=>{if(!win||win.isDestroyed())return false;if(win.isMaximized())win.unmaximize();else win.maximize();setTimeout(positionPosView,30);return win.isMaximized()})
ipcMain.handle('window:close',()=>{if(win&&!win.isDestroyed())win.close();return true})
ipcMain.handle('pos:reload',()=>reloadPos())
ipcMain.handle('hardware:status',()=>hardware.status())
ipcMain.handle('hardware:command',(_event,{channel,payload})=>hardware.command(String(channel||''),payload))
