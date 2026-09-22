const path=require('path')
const fs=require('fs')
const {app,BrowserWindow,BrowserView,ipcMain,shell,session}=require('electron')
const config=require('./config.cjs')
const hardware=require('./hardware.cjs')

const TOOLBAR_HEIGHT=76
const APP_ICON=path.join(__dirname,'../build/icon.ico')
const RITA_THEME=path.join(__dirname,'../renderer/rita-pos-theme.css')
let win,settingsWin,egaisWin,posView

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
    autoHideMenuBar:true,backgroundColor:'#111111',icon:APP_ICON,
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
    let style=document.getElementById('rita-windows-pos-layout');
    if(!style){
      style=document.createElement('style');
      style.id='rita-windows-pos-layout';
      style.textContent='.pos-toolbar{display:none!important}.pos{padding-top:0!important}';
      document.head.appendChild(style);
    }
    document.documentElement.dataset.ritaPos='1';
    return true;
  })();`
  view.webContents.executeJavaScript(script,true).catch(()=>{})
  try{
    const css=fs.readFileSync(RITA_THEME,'utf8')
    view.webContents.insertCSS(css,{cssOrigin:'author'}).catch(()=>{})
  }catch{}
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
    frame:false,backgroundColor:'#111111',icon:APP_ICON,
    fullscreen:true,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,partition:'persist:brooklyn-pos'},
    title:'Rita POS'
  })
  win.loadFile(path.join(__dirname,'../renderer/shell.html'))
  win.once('ready-to-show',()=>{
    win.setFullScreen(true)
    win.show()
    setTimeout(positionPosView,80)
  })
  win.on('resize',positionPosView)
  win.on('maximize',positionPosView)
  win.on('unmaximize',positionPosView)
  win.on('closed',()=>{win=null;posView=null})
  void loadPos()
}
function openSettings(){
  if(settingsWin&&!settingsWin.isDestroyed()){settingsWin.focus();return true}
  settingsWin=new BrowserWindow(localWindowOptions({parent:win,modal:true,title:'Rita POS — настройки'}))
  settingsWin.once('ready-to-show',()=>settingsWin.show())
  settingsWin.on('closed',()=>{settingsWin=null})
  void settingsWin.loadFile(path.join(__dirname,'../renderer/settings.html'))
  return true
}
function openEgais(){
  if(egaisWin&&!egaisWin.isDestroyed()){egaisWin.focus();return true}
  egaisWin=new BrowserWindow(localWindowOptions({parent:win,modal:true,width:1240,height:820,minWidth:980,minHeight:650,title:'Rita POS — ЕГАИС'}))
  egaisWin.once('ready-to-show',()=>egaisWin.show())
  egaisWin.on('closed',()=>{egaisWin=null})
  void egaisWin.loadFile(path.join(__dirname,'../renderer/egais.html'))
  return true
}
function isLocal(event){return String(event?.senderFrame?.url||'').startsWith('file://')}
function isTrusted(event){
  const url=String(event?.senderFrame?.url||'')
  if(url.startsWith('file://'))return true
  const server=normalizeServer(config.read().serverUrl)
  return Boolean(server&&url.startsWith(server+'/'))
}
function cachePath(){return path.join(app.getPath('userData'),'pos-cache.json')}
function validCacheKey(key){return /^brooklyn-pos-[a-z0-9._-]{1,100}$/i.test(String(key||''))}
function readPosCache(){
  try{const value=JSON.parse(fs.readFileSync(cachePath(),'utf8'));return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
  catch{return {}}
}
function writePosCache(value){
  const raw=JSON.stringify(value)
  if(Buffer.byteLength(raw,'utf8')>40*1024*1024)throw new Error('Локальная база POS превысила допустимый размер')
  const file=cachePath(),tmp=file+'.tmp'
  fs.mkdirSync(path.dirname(file),{recursive:true})
  fs.writeFileSync(tmp,raw,'utf8')
  fs.renameSync(tmp,file)
}
function cacheGet(key){
  if(!validCacheKey(key))return null
  const store=readPosCache()
  return Object.prototype.hasOwnProperty.call(store,key)?store[key]:null
}
function cacheSet(key,value){
  if(!validCacheKey(key))return {ok:false,error:'Некорректный ключ локальной базы'}
  try{
    const store=readPosCache()
    JSON.stringify(value)
    store[key]=value
    writePosCache(store)
    return {ok:true}
  }catch(e){return {ok:false,error:e.message}}
}
function cacheDelete(key){
  if(!validCacheKey(key))return {ok:false,error:'Некорректный ключ локальной базы'}
  try{const store=readPosCache();delete store[key];writePosCache(store);return {ok:true}}
  catch(e){return {ok:false,error:e.message}}
}

async function listPrinters(){
  try{
    const wc=win?.webContents
    if(!wc)return []
    const items=await wc.getPrintersAsync()
    return items.map(p=>({name:p.name,displayName:p.displayName||p.name,description:p.description||'',status:p.status||0,isDefault:!!p.isDefault}))
  }catch{return []}
}
function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))
}
async function printToDevice(payload={}){
  const c=config.read()
  const devices=Array.isArray(c.hardware?.printer?.devices)?c.hardware.printer.devices:[]
  let names=[]
  const explicit=String(payload.deviceName||'').trim()
  if(explicit)names=[explicit]
  else if(payload.printerId){
    const found=devices.find(x=>String(x.id)===String(payload.printerId))
    if(found?.deviceName)names=[String(found.deviceName)]
  }else if(payload.role){
    names=[...new Set(devices.filter(x=>String(x.role||'')===String(payload.role)&&String(x.deviceName||'').trim()).map(x=>String(x.deviceName).trim()))]
  }
  if(!names.length){
    const role=String(payload.role||'')
    return {ok:false,configured:false,error:role==='kitchen'?'В настройках не назначен принтер с ролью «Кухня»':role==='receipt'?'В настройках не назначен принтер с ролью «Чек»':'Не выбран Windows-принтер'}
  }
  const html=payload.html||`<!doctype html><meta charset="utf-8"><style>body{font:14px Arial,sans-serif;padding:10px;white-space:pre-wrap}h2{margin:0 0 10px}</style><h2>Rita POS</h2><div>${escapeHtml(payload.text||'Тестовая печать')}</div>`
  const pwin=new BrowserWindow({show:false,width:420,height:600,webPreferences:{sandbox:true}})
  try{
    await pwin.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html))
    const results=[]
    for(const deviceName of names){
      const result=await new Promise(resolve=>{
        pwin.webContents.print({silent:true,printBackground:true,deviceName},(success,failureReason)=>resolve(success?{ok:true,deviceName}:{ok:false,deviceName,error:failureReason||'Не удалось напечатать'}))
      })
      results.push(result)
    }
    const failed=results.filter(x=>!x.ok)
    return failed.length?{ok:false,configured:true,printed:results.length-failed.length,failed:failed.map(x=>x.deviceName),results,error:`Не удалось напечатать: ${failed.map(x=>x.deviceName).join(', ')}`}:{ok:true,configured:true,count:results.length,results}
  }catch(e){return {ok:false,configured:true,error:e.message}}
  finally{if(!pwin.isDestroyed())pwin.destroy()}
}

app.whenReady().then(()=>{
  app.setAppUserModelId('ru.brooklynpizza.pos')
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
    config.write({...value,serverUrl:server,fullscreen:true})
    if(previous.serverUrl!==server||!posView)await loadPos()
    return {ok:true}
  }catch(e){return {ok:false,error:e.message}}
})
ipcMain.handle('settings:open',()=>openSettings())
ipcMain.handle('egais:open',()=>openEgais())
ipcMain.handle('window:minimize',()=>{if(win&&!win.isDestroyed())win.minimize();return true})
ipcMain.handle('window:close',()=>{if(win&&!win.isDestroyed())win.close();return true})
ipcMain.handle('pos:navigate',(_event,index)=>navigatePos(index))
ipcMain.handle('pos:navState',()=>posNavState())
ipcMain.handle('cache:get',(event,key)=>isTrusted(event)?cacheGet(key):null)
ipcMain.handle('cache:set',(event,{key,value}={})=>isTrusted(event)?cacheSet(key,value):{ok:false,error:'Недоверенный источник'})
ipcMain.handle('cache:delete',(event,key)=>isTrusted(event)?cacheDelete(key):{ok:false,error:'Недоверенный источник'})
ipcMain.handle('startup:get',(event)=>isLocal(event)?Boolean(app.getLoginItemSettings().openAtLogin):false)
ipcMain.handle('startup:set',(event,enabled)=>{
  if(!isLocal(event))return {ok:false,enabled:false,error:'Автозапуск изменяется только в локальных настройках POS'}
  try{
    const value=Boolean(enabled)
    app.setLoginItemSettings({openAtLogin:value,path:process.execPath})
    return {ok:true,enabled:Boolean(app.getLoginItemSettings().openAtLogin)}
  }catch(e){return {ok:false,enabled:false,error:e.message}}
})
ipcMain.handle('printers:list',()=>listPrinters())
ipcMain.handle('printers:openSystem',()=>{void shell.openExternal('ms-settings:printers');return true})
ipcMain.handle('printers:test',(_event,payload)=>printToDevice({...payload,text:payload?.text||'Rita POS\nТестовая печать\nПринтер подключен корректно.'}))
ipcMain.handle('printer:print',(_event,payload)=>printToDevice(payload))
ipcMain.handle('hardware:status',()=>hardware.status())
ipcMain.handle('hardware:command',(_event,{channel,payload})=>hardware.command(String(channel||''),payload))
