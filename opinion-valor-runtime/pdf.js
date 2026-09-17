const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const QRCode = require('qrcode');

const SUPABASE_URL='https://nahyaauhsbcknlwdhwho.supabase.co';
const SUPABASE_KEY='sb_publishable_dC2g09WftviKEPKiAvJYpA_8-z2WxT7';
const BLUE=rgb(15/255,34/255,56/255);
const STEEL=rgb(36/255,76/255,115/255);
const LIGHT=rgb(243/255,245/255,247/255);
const GREY=rgb(82/255,105/255,124/255);
const LINE=rgb(205/255,216/255,226/255);

async function verifyUser(token){
  if(!token)return null;
  const r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`}});
  if(!r.ok)return null; return r.json();
}
async function verifyAccess(token,userId){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/user_access?id=eq.${encodeURIComponent(userId)}&select=status,role`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`}});
  if(!r.ok)return null;
  const rows=await r.json();
  return Array.isArray(rows)?rows[0]||null:null;
}

function money(v){return v==null?'Por determinar':new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(Number(v));}
function text(v){return v==null||v===''?'Por confirmar':String(v);}
function wrap(str,font,size,maxWidth){
  const words=String(str||'').split(/\s+/); const lines=[]; let line='';
  for(const word of words){const test=line?`${line} ${word}`:word;if(font.widthOfTextAtSize(test,size)<=maxWidth)line=test;else{if(line)lines.push(line);line=word;}}
  if(line)lines.push(line); return lines;
}
function drawWrapped(page,str,x,y,font,size,maxWidth,color=BLUE,lineHeight=size*1.35,maxLines=20){
  const lines=wrap(str,font,size,maxWidth).slice(0,maxLines); lines.forEach((line,i)=>page.drawText(line,{x,y:y-i*lineHeight,size,font,color})); return y-lines.length*lineHeight;
}
function header(page,fontBold,title,subtitle,folio,version){
  page.drawRectangle({x:0,y:742,width:612,height:50,color:BLUE});
  page.drawText('APPVALUO',{x:36,y:763,size:14,font:fontBold,color:rgb(1,1,1)});
  page.drawText(title,{x:36,y:721,size:20,font:fontBold,color:BLUE});
  page.drawText(subtitle,{x:36,y:704,size:8.5,font:fontBold,color:STEEL});
  page.drawText(`${folio||''}  |  V${version||1}`,{x:442,y:764,size:8,font:fontBold,color:rgb(1,1,1)});
}
function footer(page,font,folio,pageNo){
  page.drawLine({start:{x:36,y:28},end:{x:576,y:28},thickness:0.7,color:LINE});
  page.drawText(`${folio||''} · AppValuo Opinion de Valor IA`,{x:36,y:15,size:7,font,color:GREY});
  page.drawText(`${pageNo}/4`,{x:550,y:15,size:7,font,color:GREY});
}
function box(page,x,y,w,h,title,font,fontBold){
  page.drawRectangle({x,y:y-h,width:w,height:h,borderColor:LINE,borderWidth:0.8,color:rgb(1,1,1)});
  page.drawRectangle({x,y:y-24,width:w,height:24,color:LIGHT});
  page.drawText(title,{x:x+10,y:y-16,size:8,font:fontBold,color:STEEL});
}
function row(page,label,value,x,y,font,fontBold,w=250){
  page.drawText(label.toUpperCase(),{x,y,size:6.8,font:fontBold,color:GREY});
  const val=wrap(text(value),fontBold,9,w).slice(0,2); val.forEach((t,i)=>page.drawText(t,{x,y:y-12-i*11,size:9,font:fontBold,color:BLUE}));
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método no permitido'});
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const user=await verifyUser(token); if(!user?.id)return res.status(401).json({error:'La sesión expiró. Vuelve a iniciar sesión.'});
  const access=await verifyAccess(token,user.id); if(access?.status!=='approved')return res.status(403).json({error:'Esta cuenta todavía no está autorizada por el administrador.'});
  try{
    const {folio,version=1,result={},location=null,verificationUrl,profile={}}=req.body||{};
    const p=result.property||{}, c=result.calculations||{}, fields=result.fields||[], missing=result.missing||[], contradictions=result.contradictions||[], comps=result.comparables||[];
    const pdf=await PDFDocument.create();
    pdf.setTitle(`Opinion de Valor ${folio||''}`); pdf.setAuthor('AppValuo'); pdf.setSubject('Opinion de Valor inmobiliaria');
    const font=await pdf.embedFont(StandardFonts.Helvetica); const bold=await pdf.embedFont(StandardFonts.HelveticaBold);

    let page=pdf.addPage([612,792]); header(page,bold,'OPINION DE VALOR','RESUMEN EJECUTIVO E IDENTIFICACION',folio,version); footer(page,font,folio,1);
    box(page,36,676,540,86,'RESUMEN EJECUTIVO',font,bold);
    drawWrapped(page,result.summary||'Opinion de valor preparada con evidencia documental y analisis de mercado.',48,638,font,9.2,515,BLUE,12.5,5);
    page.drawRectangle({x:36,y:560,width:540,height:72,color:BLUE});
    page.drawText('VALOR CONCLUIDO',{x:52,y:608,size:8,font:bold,color:rgb(.72,.82,.9)});
    page.drawText(money(c.concluded_value),{x:52,y:579,size:24,font:bold,color:rgb(1,1,1)});
    page.drawText(`Terreno ${money(c.land_value)}   |   Construccion ${money(c.construction_value)}`,{x:300,y:586,size:8,font:bold,color:rgb(.88,.93,.97)});
    box(page,36,468,540,230,'IDENTIFICACION DEL INMUEBLE',font,bold);
    row(page,'Tipo de inmueble',p.property_type,52,424,font,bold,230); row(page,'Propietario',p.owner_name,316,424,font,bold,230);
    row(page,'Domicilio',p.address,52,374,font,bold,230); row(page,'Colonia',p.neighborhood,316,374,font,bold,230);
    row(page,'Ciudad / Estado',[p.city,p.state].filter(Boolean).join(', '),52,324,font,bold,230); row(page,'Clave catastral',p.cadastral_key,316,324,font,bold,230);
    row(page,'Superficie terreno',p.land_area_m2==null?null:`${p.land_area_m2} m2`,52,274,font,bold,230); row(page,'Superficie construccion',p.construction_area_m2==null?null:`${p.construction_area_m2} m2`,316,274,font,bold,230);
    row(page,'Antiguedad',p.age_years==null?null:`${p.age_years} anos`,52,224,font,bold,230); row(page,'Conservacion',p.conservation_state,316,224,font,bold,230);
    page.drawText('ALCANCE',{x:36,y:184,size:8,font:bold,color:STEEL});
    drawWrapped(page,'Documento orientativo sustentado en la informacion aportada, evidencia disponible y analisis de mercado. Los datos inferidos deben ser revisados antes de su uso formal.',36,166,font,8.5,540,GREY,12,5);

    page=pdf.addPage([612,792]); header(page,bold,'EVIDENCIA Y CARACTERISTICAS','DATOS INTERPRETADOS, AUDITORIA Y LOCALIZACION',folio,version); footer(page,font,folio,2);
    box(page,36,676,330,330,'DATOS CLAVE INTERPRETADOS',font,bold);
    let fy=634; for(const f of fields.slice(0,13)){page.drawText(String(f.field_path||'').slice(0,38),{x:48,y:fy,size:7.2,font:bold,color:BLUE});page.drawText(String(f.value_text??'—').slice(0,42),{x:194,y:fy,size:7.2,font,color:GREY});page.drawText(String(f.status||''),{x:310,y:fy,size:6.5,font:bold,color:f.status==='CONFIRMED'?STEEL:GREY});fy-=22;}
    box(page,382,676,194,330,'AUDITOR',font,bold);
    let ay=634; const audit=[...missing.map(x=>`FALTA: ${x}`),...contradictions.map(x=>`CONFLICTO: ${x.description}`)];
    if(!audit.length)audit.push('Sin faltantes indispensables detectados.');
    for(const item of audit.slice(0,10)){ay=drawWrapped(page,item,394,ay,font,7.5,168,BLUE,10,3)-8;}
    box(page,36,324,540,208,'MICRO Y MACROLOCALIZACION',font,bold);
    const coords=location?.latitude!=null?`${Number(location.latitude).toFixed(6)}, ${Number(location.longitude).toFixed(6)}`:'Coordenadas por confirmar';
    row(page,'Referencia',p.address||p.neighborhood,52,278,font,bold,490); row(page,'Coordenadas',coords,52,230,font,bold,490);
    page.drawRectangle({x:52,y:126,width:238,height:70,color:LIGHT,borderColor:LINE,borderWidth:0.7});page.drawText('MICROLOCALIZACION',{x:108,y:157,size:9,font:bold,color:STEEL});
    page.drawRectangle({x:322,y:126,width:238,height:70,color:LIGHT,borderColor:LINE,borderWidth:0.7});page.drawText('MACROLOCALIZACION',{x:378,y:157,size:9,font:bold,color:STEEL});
    page.drawText('Los mapas se integran desde la ubicacion confirmada del expediente.',{x:52,y:104,size:7.5,font,color:GREY});

    page=pdf.addPage([612,792]); header(page,bold,'INVESTIGACION DE MERCADO','COMPARABLES Y HOMOLOGACION',folio,version); footer(page,font,folio,3);
    box(page,36,676,540,360,'COMPARABLES VERIFICABLES',font,bold);
    const cols=[{x:48,w:170,t:'UBICACION'},{x:225,w:90,t:'PRECIO'},{x:325,w:70,t:'SUP.'},{x:404,w:72,t:'$/M2'},{x:485,w:78,t:'FUENTE'}];
    cols.forEach(col=>page.drawText(col.t,{x:col.x,y:632,size:6.8,font:bold,color:GREY}));
    let cy=610; const list=comps.slice(0,8);
    if(!list.length){page.drawText('No se integraron comparables verificables en este analisis.',{x:48,y:600,size:9,font,color:GREY});}
    for(const x of list){page.drawLine({start:{x:48,y:cy-5},end:{x:562,y:cy-5},thickness:.4,color:LINE});page.drawText(String(x.location||'').slice(0,32),{x:48,y:cy,size:7,font,color:BLUE});page.drawText(money(x.price),{x:225,y:cy,size:7,font:bold,color:BLUE});page.drawText(`${x.land_area_m2||x.construction_area_m2||'—'}`,{x:325,y:cy,size:7,font,color:BLUE});page.drawText(money(x.unit_value),{x:404,y:cy,size:7,font,color:BLUE});page.drawText(String(x.source_name||'').slice(0,13),{x:485,y:cy,size:7,font,color:STEEL});cy-=35;}
    box(page,36,292,540,150,'CONCLUSION DE MERCADO Y FACTORES',font,bold);
    page.drawText(`Factor de terreno: ${c.land_factor??'Por confirmar'}    COS: ${c.cos??'—'}    CUS: ${c.cus??'—'}`,{x:50,y:250,size:8,font:bold,color:STEEL});
    drawWrapped(page,c.conclusion||'Conclusion de mercado pendiente de validacion.',50,226,font,9,510,BLUE,12.5,7);
    page.drawText('Fuentes:',{x:36,y:116,size:7,font:bold,color:GREY});
    drawWrapped(page,list.map(x=>x.source_url).filter(Boolean).join(' | ')||'Sin enlaces incorporados.',36,102,font,6.5,540,GREY,9,5);

    page=pdf.addPage([612,792]); header(page,bold,'CONCLUSION','VALOR CONCLUIDO, CROQUIS Y VERIFICACION',folio,version); footer(page,font,folio,4);
    page.drawRectangle({x:36,y:590,width:540,height:86,color:BLUE});page.drawText('VALOR CONCLUIDO',{x:54,y:642,size:9,font:bold,color:rgb(.75,.85,.94)});page.drawText(money(c.concluded_value),{x:54,y:608,size:28,font:bold,color:rgb(1,1,1)});
    box(page,36,566,540,124,'CONCLUSION TECNICA',font,bold);drawWrapped(page,c.conclusion||result.summary||'Conclusion pendiente.',50,526,font,9.2,512,BLUE,12.8,7);
    box(page,36,418,540,230,'CROQUIS DEL INMUEBLE',font,bold);page.drawRectangle({x:54,y:220,width:504,height:154,color:LIGHT,borderColor:LINE,borderWidth:.8});page.drawText('CROQUIS / ANEXO PRINCIPAL',{x:198,y:292,size:11,font:bold,color:STEEL});page.drawText('El bloque de croquis no comparte espacio con firmas.',{x:176,y:274,size:7.5,font,color:GREY});
    const qrData=await QRCode.toDataURL(verificationUrl||'https://appvaluo.invalid',{margin:1,width:240});
    const qr=await pdf.embedPng(Buffer.from(qrData.split(',')[1],'base64'));page.drawImage(qr,{x:50,y:70,width:88,height:88});
    page.drawText('VERIFICACION DOCUMENTAL',{x:156,y:142,size:9,font:bold,color:STEEL});
    drawWrapped(page,verificationUrl||'Token de verificacion no disponible',156,125,font,6.7,400,GREY,9,4);
    const perito=profile.full_name?`PERITO VALUADOR: ${profile.full_name}`:'PERITO VALUADOR: [NOMBRE]';
    page.drawText(perito,{x:156,y:82,size:8.5,font:bold,color:BLUE});
    page.drawText('Documento generado sin firma grafica automatica.',{x:156,y:66,size:7,font,color:GREY});

    const bytes=await pdf.save();
    res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`inline; filename="opinion_valor_${String(folio||'appvaluo').replace(/[^a-zA-Z0-9_-]/g,'_')}_v${version}.pdf"`);res.setHeader('Cache-Control','no-store');return res.status(200).send(Buffer.from(bytes));
  }catch(e){console.error('pdf',e);return res.status(500).json({error:e instanceof Error?e.message:'No se pudo generar el PDF.'});}
};