const http=require('http')
const https=require('https')
const config=require('./config.cjs')

function notConfigured(name){return {ok:false,configured:false,error:`${name}: интеграция ещё не настроена`}}
function request(url,{method='GET',body,token,timeout=3000}={}){return new Promise(resolve=>{try{const u=new URL(url);const lib=u.protocol==='https:'?https:http;const data=body===undefined?null:Buffer.from(JSON.stringify(body));const headers={Accept:'application/json'};if(data){headers['Content-Type']='application/json';headers['Content-Length']=String(data.length)}if(token)headers.Authorization=`Bearer ${token}`;const req=lib.request({method,hostname:u.hostname,port:u.port||undefined,path:u.pathname+u.search,timeout,headers},res=>{const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>{const raw=Buffer.concat(chunks).toString('utf8');let parsed={};try{parsed=raw?JSON.parse(raw):{}}catch{parsed={raw}}resolve({ok:(res.statusCode||500)<400,status:res.statusCode||0,...parsed})})});req.on('timeout',()=>{req.destroy();resolve({ok:false,error:'Таймаут'})});req.on('error',e=>resolve({ok:false,error:e.message}));if(data)req.write(data);req.end()}catch(e){resolve({ok:false,error:e.message})}})}
function join(base,path){try{const b=String(base||'').replace(/\/$/,'');return new URL(path,b+'/').toString()}catch{return ''}}
function adapter(setting,path,payload){if(!setting?.enabled||!setting?.adapterUrl)return Promise.resolve(notConfigured('Локальный адаптер'));return request(join(setting.adapterUrl,path),{method:'POST',body:payload||{},token:setting.token,timeout:5000})}
function httpPing(url){return request(url,{timeout:1800})}

async function status(){
  const c=config.read(),mark=c.hardware.marking,acq=c.hardware.acquiring
  return {ok:true,
    fiscal:{...c.hardware.fiscal,status:c.hardware.fiscal.enabled&&c.hardware.fiscal.adapterUrl?await adapter(c.hardware.fiscal,'v1/fiscal/status',{}):{ok:false,disabled:!c.hardware.fiscal.enabled}},scanner:{...c.hardware.scanner},printer:{...c.hardware.printer},cashDrawer:{...c.hardware.cashDrawer},
    acquiring:{...acq,status:acq.enabled&&acq.adapterUrl?await adapter(acq,'v1/acquiring/status',{}):{ok:false,disabled:!acq.enabled}},
    egais:{...c.hardware.egais,status:c.hardware.egais.enabled?await httpPing(c.hardware.egais.utmUrl):{ok:false,disabled:true}},
    marking:{...mark,token:mark.token?'••••••••':'',status:mark.enabled&&mark.adapterUrl?await adapter(mark,'v1/marking/status',{}):{ok:false,disabled:!mark.enabled}}
  }
}
async function command(channel,payload={}){
  const c=config.read()
  switch(channel){
    case 'fiscal.status':return c.hardware.fiscal.enabled?adapter(c.hardware.fiscal,'v1/fiscal/status',payload):notConfigured('Касса')
    case 'fiscal.receipt':return c.hardware.fiscal.enabled?adapter(c.hardware.fiscal,'v1/fiscal/receipt',payload):notConfigured('Фискализация')
    case 'fiscal.xReport':return c.hardware.fiscal.enabled?adapter(c.hardware.fiscal,'v1/fiscal/x-report',payload):notConfigured('X-отчёт АТОЛ')
    case 'fiscal.zReport':return c.hardware.fiscal.enabled?adapter(c.hardware.fiscal,'v1/fiscal/z-report',payload):notConfigured('Z-отчёт АТОЛ')
    case 'fiscal.cashIn':return c.hardware.fiscal.enabled?adapter(c.hardware.fiscal,'v1/fiscal/cash-in',payload):notConfigured('Внесение через АТОЛ')
    case 'fiscal.cashOut':return c.hardware.fiscal.enabled?adapter(c.hardware.fiscal,'v1/fiscal/cash-out',payload):notConfigured('Изъятие через АТОЛ')
    case 'acquiring.status':return c.hardware.acquiring.enabled?adapter(c.hardware.acquiring,'v1/acquiring/status',payload):notConfigured('Терминал Сбербанка')
    case 'acquiring.pay':return c.hardware.acquiring.enabled?adapter(c.hardware.acquiring,'v1/acquiring/pay',payload):notConfigured('Терминал Сбербанка')
    case 'acquiring.refund':return c.hardware.acquiring.enabled?adapter(c.hardware.acquiring,'v1/acquiring/refund',payload):notConfigured('Терминал Сбербанка')
    case 'acquiring.reconcile':return c.hardware.acquiring.enabled?adapter(c.hardware.acquiring,'v1/acquiring/reconcile',payload):notConfigured('Сверка терминала Сбербанка')
    case 'egais.ping':return c.hardware.egais.enabled?httpPing(c.hardware.egais.utmUrl):notConfigured('ЕГАИС')
    case 'egais.incoming':return c.hardware.egais.enabled&&c.hardware.egais.adapterUrl?adapter(c.hardware.egais,'v1/egais/incoming',payload):notConfigured('Адаптер ЕГАИС/УТМ')
    case 'egais.accept':return c.hardware.egais.enabled&&c.hardware.egais.adapterUrl?adapter(c.hardware.egais,'v1/egais/accept',payload):notConfigured('Адаптер ЕГАИС/УТМ')
    case 'egais.reject':return c.hardware.egais.enabled&&c.hardware.egais.adapterUrl?adapter(c.hardware.egais,'v1/egais/reject',payload):notConfigured('Адаптер ЕГАИС/УТМ')
    case 'egais.tap':return c.hardware.egais.enabled&&c.hardware.egais.adapterUrl?adapter(c.hardware.egais,'v1/egais/tap',payload):notConfigured('Адаптер ЕГАИС/УТМ')
    case 'marking.status':return c.hardware.marking.enabled?adapter(c.hardware.marking,'v1/marking/status',payload):notConfigured('Честный знак')
    case 'marking.check':return c.hardware.marking.enabled?adapter(c.hardware.marking,'v1/marking/check',payload):notConfigured('Честный знак')
    case 'printer.print':return notConfigured('Принтер')
    default:return {ok:false,error:`Неизвестная команда оборудования: ${channel}`}
  }
}
module.exports={status,command}
