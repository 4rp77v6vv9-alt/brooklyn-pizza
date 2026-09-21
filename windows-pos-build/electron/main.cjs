const path=require('path')
const {app,BrowserWindow,BrowserView,ipcMain,shell,session}=require('electron')
const config=require('./config.cjs')
const hardware=require('./hardware.cjs')

const TOOLBAR_HEIGHT=58
let win,settingsWin,posView

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
function installDesktopLayout(view){
  const script=`(()=>{
    let style=document.getElementById('brooklyn-windows-pos-layout');
    if(!style){
      style=document.createElement('style');
      style.id='brooklyn-windows-pos-layout';
      style.textContent='.pos-toolbar{display:none!important}.pos{padding-top:0!important}';
      document.head.appendChild(style);
    }
    return true;
  })();`
  view.webContents.executeJavaScript(script,true).catch(()=>{})
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
  view.webContents.on('did-finish-load',()=>installDesktopLayout(view))
}
async function loadPos(){
  const c=config.read(),server=normalizeServer(c.serverUrl)
  if(!server){
    if(posView&&win){win.removeBrowserView(posView);posView.webContents.close();posView=null}
    openSettings()
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
async function navigatePos(index){
  if(!posView||posView.webContents.isDestroyed())return false
  return posView.webContents.executeJavaScript(`(()=>{
    const buttons=[...document.querySelectorAll('.pos-nav button')];
    const button=buttons[${Number(index)||0}];
    if(!button)return false;
    button.click();
    return true;
  })();`,true).catch(()=>false)
}
async function posNavState(){
  if(!posView||posView.webContents.isDestroyed())return {ready:false,active:0,orderCount:'',savedLabel:'Отложенные · 0'}
  return posView.webContents.executeJavaScript(`(()=>{
    const buttons=[...document.querySelectorAll('.pos-nav button')];
    if(buttons.length<5)return {ready:false,active:0,orderCount:'',savedLabel:'Отложенные · 0'};
    return {
      ready:true,
      active:Math.max(0,buttons.findIndex(b=>b.classList.contains('selected'))),
      orderCount:document.querySelector('.pos-order-count')?.textContent?.trim()||'',
      savedLabel:buttons[2]?.textContent?.trim()||'Отложенные · 0'
    };
  })();`,true).catch(()=>({ready:false,active:0,orderCount:'',savedLabel:'Отложенные · 0'}))
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
  win.on('closed',()=>{win=null;posView=null})
  void loadPos()
}
function openSettings(){
  if(settingsWin&&!settingsWin.isDestroyed()){settingsWin.focus();return true}
  settingsWin=new BrowserWindow(localWindowOptions({parent:win,modal:true,title:'Brooklyn Pizza POS — настройки'}))
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
  if(!isLocal(event))return {ok:false,error:'Настройки изменяются только в локальном окне Windows POS'}
  try{
    const server=normalizeServer(value?.serverUrl)
    if(!server)return {ok:false,error:'Укажите полный адрес сайта, например https://ваш-домен.ru'}
    const previous=config.read()
    config.write({...value,serverUrl:server,fullscreen:false})
    if(previous.serverUrl!==server||!posView)await loadPos()
    return {ok:true}
  }catch(e){return {ok:false,error:e.message}}
})
ipcMain.handle('settings:open',()=>openSettings())
ipcMain.handle('window:minimize',()=>{if(win&&!win.isDestroyed())win.minimize();return true})
ipcMain.handle('window:close',()=>{if(win&&!win.isDestroyed())win.close();return true})
ipcMain.handle('pos:navigate',(_event,index)=>navigatePos(index))
ipcMain.handle('pos:navState',()=>posNavState())
ipcMain.handle('hardware:status',()=>hardware.status())
ipcMain.handle('hardware:command',(_event,{channel,payload})=>hardware.command(String(channel||''),payload))
