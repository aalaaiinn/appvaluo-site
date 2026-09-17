const MAX_FILES = 24;
const SUPABASE_URL = 'https://nahyaauhsbcknlwdhwho.supabase.co';
const SUPABASE_KEY = 'sb_publishable_dC2g09WftviKEPKiAvJYpA_8-z2WxT7';

const systemPrompt = `Eres el AGENTE VALUADOR APPVALUO para Opinión de Valor Rápida. Convierte un mensaje, documentos, fotos, croquis, ubicación y correcciones en datos estructurados.
REGLAS: 1) No inventes datos. 2) Precedencia: corrección expresa del usuario > documento oficial > texto del usuario > inferencia IA > inferencia visual. 3) Conserva correcciones previas. 4) Distingue CONFIRMED, INFERRED y MISSING. 5) Reporta contradicciones. 6) No infieras materiales ocultos. 7) I, II, III, IV significan niveles solo cuando el contexto lo demuestra. 8) T1 no significa automáticamente losa. 9) Calcula COS/CUS solo con datos suficientes. 10) Factor terreno normal 1.00, esquina 1.10, dos calles 1.10, local comercial favorable 1.15; otros factores requieren justificación. 11) Comparables reales y verificables, siempre con URL. 12) No rellenes desconocidos con cero. 13) Conclusión técnica, breve y defendible. 14) Pregunta solo faltantes indispensables. 15) En México trabaja en MXN salvo indicación distinta. Devuelve únicamente JSON con el esquema solicitado.`;

const schema = {
  type:'object', additionalProperties:false,
  properties:{
    summary:{type:'string'},
    property:{type:'object',additionalProperties:false,properties:{
      property_type:{type:['string','null']},owner_name:{type:['string','null']},cadastral_key:{type:['string','null']},address:{type:['string','null']},neighborhood:{type:['string','null']},city:{type:['string','null']},state:{type:['string','null']},current_use:{type:['string','null']},land_area_m2:{type:['number','null']},construction_area_m2:{type:['number','null']},age_years:{type:['number','null']},levels:{type:['number','null']},conservation_state:{type:['string','null']},quality:{type:['string','null']},bedrooms:{type:['number','null']},bathrooms:{type:['number','null']},parking_spaces:{type:['number','null']},frontage_m:{type:['number','null']},depth_m:{type:['number','null']},shape:{type:['string','null']},topography:{type:['string','null']},corner:{type:['boolean','null']},two_streets:{type:['boolean','null']}
    },required:['property_type','owner_name','cadastral_key','address','neighborhood','city','state','current_use','land_area_m2','construction_area_m2','age_years','levels','conservation_state','quality','bedrooms','bathrooms','parking_spaces','frontage_m','depth_m','shape','topography','corner','two_streets']},
    fields:{type:'array',items:{type:'object',additionalProperties:false,properties:{field_path:{type:'string'},value_text:{type:['string','null']},confidence:{type:'number',minimum:0,maximum:1},source:{type:'string'},status:{type:'string',enum:['CONFIRMED','INFERRED','MISSING']}},required:['field_path','value_text','confidence','source','status']}},
    contradictions:{type:'array',items:{type:'object',additionalProperties:false,properties:{field_path:{type:'string'},description:{type:'string'}},required:['field_path','description']}},
    missing:{type:'array',items:{type:'string'}},
    comparables:{type:'array',items:{type:'object',additionalProperties:false,properties:{category:{type:'string',enum:['TERRENO','CONSTRUCCION']},source_name:{type:'string'},source_url:{type:'string'},location:{type:'string'},price:{type:'number'},land_area_m2:{type:['number','null']},construction_area_m2:{type:['number','null']},age_years:{type:['number','null']},unit_value:{type:['number','null']},notes:{type:['string','null']}},required:['category','source_name','source_url','location','price','land_area_m2','construction_area_m2','age_years','unit_value','notes']}},
    calculations:{type:'object',additionalProperties:false,properties:{cos:{type:['number','null']},cus:{type:['number','null']},land_factor:{type:['number','null']},land_unit_value:{type:['number','null']},land_value:{type:['number','null']},construction_unit_value:{type:['number','null']},construction_value:{type:['number','null']},physical_value:{type:['number','null']},market_value:{type:['number','null']},concluded_value:{type:['number','null']},conclusion:{type:['string','null']}},required:['cos','cus','land_factor','land_unit_value','land_value','construction_unit_value','construction_value','physical_value','market_value','concluded_value','conclusion']},
    next_message:{type:'string'}
  },required:['summary','property','fields','contradictions','missing','comparables','calculations','next_message']
};

function outputText(payload){
  if(payload&&typeof payload.output_text==='string')return payload.output_text;
  for(const item of (payload?.output||[]))for(const part of (item?.content||[]))if(part?.type==='output_text'&&typeof part.text==='string')return part.text;
  return null;
}

async function verifyUser(token){
  if(!token)return null;
  const r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`}});
  if(!r.ok)return null;
  return r.json();
}

async function verifyAccess(token,userId){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/user_access?id=eq.${encodeURIComponent(userId)}&select=status,role`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`}});
  if(!r.ok)return null;
  const rows=await r.json();
  return Array.isArray(rows)?rows[0]||null:null;
}

async function transcribeAudio(apiKey,url,name,mime){
  const source=await fetch(url); if(!source.ok)throw new Error(`No se pudo leer ${name}`);
  const blob=await source.blob(); const form=new FormData();
  form.append('model',process.env.OPENAI_TRANSCRIBE_MODEL||'gpt-transcribe');
  form.append('file',blob,name||'audio');
  const r=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`},body:form});
  const data=await r.json(); if(!r.ok)throw new Error(`No se pudo transcribir ${name}`); return String(data.text||'').trim();
}

async function uploadRemoteFile(apiKey,url,name,mime){
  const source=await fetch(url); if(!source.ok)throw new Error(`No se pudo leer ${name}`);
  const blob=await source.blob(); const form=new FormData(); form.append('purpose','user_data'); form.append('file',blob,name||'archivo');
  const r=await fetch('https://api.openai.com/v1/files',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`},body:form});
  const data=await r.json(); if(!r.ok||!data.id)throw new Error(`No se pudo preparar ${name}`); return data.id;
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Método no permitido'});
  const apiKey=process.env.OPENAI_API_KEY;
  if(!apiKey)return res.status(503).json({error:'Falta configurar OPENAI_API_KEY en este proyecto independiente.'});
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const user=await verifyUser(token);
  if(!user?.id)return res.status(401).json({error:'La sesión expiró. Vuelve a iniciar sesión.'});
  const access=await verifyAccess(token,user.id);
  if(access?.status!=='approved')return res.status(403).json({error:'Esta cuenta todavía no está autorizada por el administrador.'});
  try{
    const body=req.body||{}; const message=String(body.message||'').trim();
    const attachments=Array.isArray(body.attachments)?body.attachments.slice(0,MAX_FILES):[];
    if(!message)return res.status(422).json({error:'Escribe una instrucción para generar la opinión.'});
    const content=[];
    if(body.previous)content.push({type:'input_text',text:`CONTEXTO ESTRUCTURADO DEL MISMO EXPEDIENTE. Conserva correcciones previas confirmadas:\n${JSON.stringify(body.previous)}`});
    content.push({type:'input_text',text:message+(body.location?.latitude!=null?`\n\nUbicación GPS del dispositivo: ${body.location.latitude}, ${body.location.longitude}.`: '')});
    for(const a of attachments){
      const type=String(a.mimeType||'application/octet-stream');
      if(type.startsWith('audio/')){
        const transcript=await transcribeAudio(apiKey,a.url,a.name,type); content.push({type:'input_text',text:`TRANSCRIPCIÓN DE AUDIO (${a.name}):\n${transcript}`});
      }else if(type.startsWith('image/')){
        content.push({type:'input_image',image_url:a.url,detail:'auto'}); content.push({type:'input_text',text:`Nombre de imagen adjunta: ${a.name}`});
      }else if(type==='application/pdf'){
        content.push({type:'input_file',file_url:a.url}); content.push({type:'input_text',text:`Nombre de documento adjunto: ${a.name}`});
      }else{
        const fileId=await uploadRemoteFile(apiKey,a.url,a.name,type); content.push({type:'input_file',file_id:fileId}); content.push({type:'input_text',text:`Nombre de documento adjunto: ${a.name}`});
      }
    }
    const needsMarket=/comparab|mercado|investiga|precio de venta|valor de mercado|busca propiedades/i.test(message);
    const requestPayload={
      model:process.env.OPENAI_MODEL||'gpt-5.6-terra',
      reasoning:{effort:process.env.OPENAI_REASONING_EFFORT||'medium'},
      input:[{role:'system',content:[{type:'input_text',text:systemPrompt}]},{role:'user',content}],
      text:{format:{type:'json_schema',name:'appvaluo_opinion_valor',strict:true,schema}}
    };
    if(needsMarket)requestPayload.tools=[{type:'web_search'}];
    const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(requestPayload)});
    const payload=await r.json();
    if(!r.ok)return res.status(r.status).json({error:payload?.error?.message||'El motor de IA no pudo procesar el expediente.'});
    const text=outputText(payload); if(!text)return res.status(502).json({error:'La IA terminó sin devolver una extracción estructurada.'});
    return res.status(200).json({data:{result:JSON.parse(text),processedFiles:attachments.length,searchedMarket:needsMarket,model:requestPayload.model}});
  }catch(e){console.error('analyze',e);return res.status(500).json({error:e instanceof Error?e.message:'No se pudo completar el análisis.'});}
};