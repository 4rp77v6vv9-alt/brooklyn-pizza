const path=require('path')
const {app,BrowserWindow,WebContentsView,ipcMain,shell,session}=require('electron')
const config=require('./config.cjs')
const hardware=require('./hardware.cjs')

const TOOLBAR_HEIGHT=56
let win,settingsWin,posView

function normalizeServer(raw){
  const value=String(raw||'').trim().replace(/\/$/,'')
  if(!value)return ''
  try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol))return '';return u.toString().replace(/\/$/,'')}catch{return ''}
}
function localOptions(extra={}){
  return {width:1440,height:900,minWidth:1050,minHeight:680,show:false,autoHideMenuBar:true,backgroundColor:'#101114',
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true},...extra}
}
function viewOptions(){
  return {webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,partition:'persist:brooklyn-pos'}}
}
function sendState(state){if(win&&!win.isDestroyed())win.webContents.send('pos:state',state)}
function removePosView(){
  if(!posView)return
  try{win.contentView.removeChildView(posView)}catch{}
  try{posView.webContents.close()}catch{}
  posView=null
}
function layoutPosView(){
  if(!win||!posView)return
  const [width,height]=win.getContentSize()
  posView.setBounds({x:0,y:TOOLBAR_HEIGHT,width:Math.max(0,width),height:Math.max(0,height-TOOLBAR_HEIGHT)})
}
function secureRemoteNavigation(view,server){
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
}
async function createPosView(server){
  removePosView()
  posView=new WebContentsView(viewOptions())
  win.contentView.addChildView(posView)
  layoutPosView()
  secureRemoteNavigation(posView,server)
  posView.webContents.on('did-start-loading',()=>sendState({status:'loading',server}))
  posView.webContents.on('did-stop-loading',()=>sendState({status:'online',server}))
  posView.webContents.on('did-fail-load',(_e,code,description,url,isMainFrame)=>{
    if(isMainFrame!==false)sendState({status:'offline',server,error:`${description} (${code})`,url})
  })
  await posView.webContents.loadURL(server+'/pos')
}
async function loadPos(){
  const c=config.read(),server=normalizeServer(c.serverUrl)
  removePosView()
  if(!server){
    await win.loadFile(path.join(__dirname,'../renderer/setup.html'))
    return
  }
  await win.loadFile(path.join(__dirname,'../renderer/shell.html'))
  await createPosView(server)
}
function createWindow(){
  win=new BrowserWindow(localOptions({title:'Brooklyn Pizza POS'}))
  win.once('ready-to-show',()=>{win.show();if(!win.isMaximized())win.center()})
  win.on('resize',layoutPosView)
  win.on('maximize',layoutPosView)
  win.on('unmaximize',layoutPosView)
  win.on('enter-full-screen',()=>{layoutPosView();win.webContents.send('window:fullscreen',true)})
  win.on('leave-full-screen',()=>{layoutPosView();win.webContents.send('window:fullscreen',false)})
  void loadPos()
}
function openSettings(){
  if(settingsWin&&!settingsWin.isDestroyed()){settingsWin.focus();return true}
  settingsWin=new BrowserWindow(localOptions({parent:win,modal:true,width:920,height:780,minWidth:760,minHeight:620,title:'Brooklyn Pizza POS — оборудование'}))
  settingsWin.once('ready-to-show',()=>settingsWin.show())
  settingsWin.on('closed',()=>{settingsWin=null})
  void settingsWin.loadFile(path.join(__dirname,'../renderer/settings.html'))
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
  if(!isLocal(event))return {ok:false,error:'Настройки оборудования изменяются только в локальном окне Windows POS'}
  try{
    const server=normalizeServer(value?.serverUrl)
    if(!server)return {ok:false,error:'Укажите полный адрес сервера, например https://pizza.example'}
    const previous=config.read()
    config.write({...value,serverUrl:server,fullscreen:false})
    if(previous.serverUrl!==server||!posView)await loadPos()
    return {ok:true}
  }catch(e){return {ok:false,error:e.message}}
})
ipcMain.handle('settings:open',()=>openSettings())
ipcMain.handle('window:toggleFullscreen',()=>{if(!win)return false;win.setFullScreen(!win.isFullScreen());return win.isFullScreen()})
ipcMain.handle('window:minimize',()=>{win?.minimize();return true})
ipcMain.handle('window:maximize',()=>{if(!win)return false;win.isMaximized()?win.unmaximize():win.maximize();return win.isMaximized()})
ipcMain.handle('window:close',()=>{win?.close();return true})
ipcMain.handle('pos:reload',()=>{if(posView){posView.webContents.reload();return true}void loadPos();return true})
ipcMain.handle('hardware:status',()=>hardware.status())
ipcMain.handle('hardware:command',(_event,{channel,payload})=>hardware.command(String(channel||''),payload))
