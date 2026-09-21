const fs=require('fs')
const path=require('path')
const {app}=require('electron')

const defaults={
  serverUrl:'',
  fullscreen:true,
  hardware:{
    fiscal:{enabled:false,provider:'atol',model:'',connection:'driver',address:'',adapterUrl:''},
    acquiring:{enabled:false,provider:'sberbank',mode:'local_adapter',adapterUrl:''},
    scanner:{enabled:true,mode:'keyboard'},
    printer:{enabled:true,devices:[]},
    kitchenScreens:[],
    cashDrawer:{enabled:false,provider:'fiscal'},
    egais:{enabled:false,utmUrl:'http://127.0.0.1:8080',adapterUrl:''},
    marking:{enabled:false,provider:'ts_piot_adapter',adapterUrl:'',token:''}
  }
}
function file(){return path.join(app.getPath('userData'),'config.json')}
function merge(a,b){
  const hw=b?.hardware||{}
  const legacyPrinter=hw.printer||{}
  const printer={...a.hardware.printer,...legacyPrinter}
  if(!Array.isArray(printer.devices))printer.devices=[]
  const kitchenScreens=Array.isArray(hw.kitchenScreens)?hw.kitchenScreens:[]
  return {...a,...(b||{}),hardware:{
    fiscal:{...a.hardware.fiscal,...(hw.fiscal||{})},
    acquiring:{...a.hardware.acquiring,...(hw.acquiring||{})},
    scanner:{...a.hardware.scanner,...(hw.scanner||{})},
    printer,
    kitchenScreens,
    cashDrawer:{...a.hardware.cashDrawer,...(hw.cashDrawer||{})},
    egais:{...a.hardware.egais,...(hw.egais||{})},
    marking:{...a.hardware.marking,...(hw.marking||{})}
  }}
}
function read(){try{return merge(defaults,JSON.parse(fs.readFileSync(file(),'utf8')))}catch{return structuredClone(defaults)}}
function write(value){const next=merge(defaults,value);fs.mkdirSync(path.dirname(file()),{recursive:true});fs.writeFileSync(file(),JSON.stringify(next,null,2));return next}
function publicView(value=read()){
  const c=structuredClone(value)
  if(c.hardware?.marking)c.hardware.marking.token=c.hardware.marking.token?'••••••••':''
  return c
}
module.exports={read,write,defaults,publicView}
