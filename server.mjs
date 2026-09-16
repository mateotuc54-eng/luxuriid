import dotenv from "dotenv";
dotenv.config({ override: true });
import express from "express";
import OpenAI from "openai";
import Stripe from "stripe";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SITE_URL = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const ORDERS_FILE = path.join(process.cwd(), "orders.json");
const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";
const imageModel = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

function readOrders(){try{return JSON.parse(fs.readFileSync(ORDERS_FILE,"utf8"))}catch{return []}}
function writeOrders(v){fs.writeFileSync(ORDERS_FILE,JSON.stringify(v,null,2))}
function rememberOrder(order){const a=readOrders();const i=a.findIndex(x=>x.id===order.id);if(i>=0)a[i]={...a[i],...order};else a.unshift(order);writeOrders(a.slice(0,500))}

// Generated clean assets stay server-side until Stripe confirms payment.
const PRIVATE_ASSETS = new Map();
const ASSET_TTL_MS = 60 * 60 * 1000;
function cleanupPrivateAssets(){
  const now=Date.now();
  for(const [id,asset] of PRIVATE_ASSETS){if(now-asset.createdAt>ASSET_TTL_MS)PRIVATE_ASSETS.delete(id)}
}
setInterval(cleanupPrivateAssets,10*60*1000).unref();

async function createWatermarkedPreview(input){
  const watermarkSvg = Buffer.from(`
    <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
      <defs><pattern id="p" width="420" height="180" patternUnits="userSpaceOnUse" patternTransform="rotate(-25)">
        <text x="0" y="90" fill="#ffffff" fill-opacity="0.20" font-family="Arial,sans-serif" font-size="30" font-weight="700" letter-spacing="5">LUXURIID · APERÇU</text>
      </pattern></defs>
      <rect width="1024" height="1024" fill="url(#p)"/>
      <rect x="95" y="445" width="834" height="134" rx="18" fill="#000" fill-opacity="0.48" stroke="#fff" stroke-opacity="0.24"/>
      <text x="512" y="502" text-anchor="middle" fill="#fff" fill-opacity="0.94" font-family="Arial,sans-serif" font-size="28" font-weight="700" letter-spacing="4">LUXURIID · APERÇU</text>
      <text x="512" y="545" text-anchor="middle" fill="#fff" fill-opacity="0.78" font-family="Arial,sans-serif" font-size="17" letter-spacing="2">PAIEMENT REQUIS POUR L’EXPORT FINAL</text>
    </svg>`);
  return sharp(input).resize(1024,1024,{fit:'contain',background:{r:13,g:13,b:12}}).composite([{input:watermarkSvg}]).png().toBuffer();
}

const ALLOWED_ORIGIN = "https://mateotuc54-eng.github.io";

app.use((req,res,next)=>{
  const origin=req.headers.origin;

  if(origin===ALLOWED_ORIGIN){
    res.setHeader("Access-Control-Allow-Origin",origin);
  }

  res.setHeader("Vary","Origin");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");

  if(req.method==="OPTIONS") return res.sendStatus(204);

  next();
});
// Stripe webhook must receive the raw body before express.json().
app.post("/api/stripe/webhook", express.raw({type:"application/json"}), (req,res)=>{
  if(!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).send("Stripe webhook not configured");
  try{
    const event=stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
    if(event.type==="checkout.session.completed"){const x=event.data.object;rememberOrder({id:x.id,status:x.payment_status,plan:x.metadata?.plan||"",email:x.customer_details?.email||"",createdAt:new Date().toISOString()});}
    res.json({received:true});
  }catch(e){console.error("STRIPE WEBHOOK:",e.message);res.status(400).send(`Webhook Error: ${e.message}`)}
});

app.use(express.json({limit:"2mb"}));
app.use(express.static("."));

app.get("/api/health",(_req,res)=>res.json({ok:true,aiKeyConfigured:Boolean(process.env.OPENAI_API_KEY),stripeConfigured:Boolean(stripe),webhookConfigured:Boolean(process.env.STRIPE_WEBHOOK_SECRET),model,imageModel}));

app.post("/api/brand-kit", async (req,res)=>{
  const {brand,sector,style,audience,request,directionName}=req.body||{};
  if(!brand||!request)return res.status(400).json({error:"Le brief est incomplet. Indiquez au minimum le nom de la marque et la demande du client."});
  if(!client)return res.status(500).json({error:"OPENAI_API_KEY manquante dans .env"});
  const schema={type:"object",additionalProperties:false,properties:{name:{type:"string"},slogan:{type:"string"},position:{type:"string"},palette:{type:"array",minItems:4,maxItems:4,items:{type:"string"}},primaryFont:{type:"string",enum:["Playfair Display","Cormorant Garamond","DM Sans","Manrope"]},secondaryFont:{type:"string",enum:["Playfair Display","Cormorant Garamond","DM Sans","Manrope"]},visualDirection:{type:"string"},composition:{type:"string"},shapeLanguage:{type:"string"},contrast:{type:"string"},texture:{type:"string"},logoStyle:{type:"string"},monogramStyle:{type:"string"},photoDirection:{type:"string"},pattern:{type:"string"},accentUse:{type:"string"},applications:{type:"array",minItems:4,maxItems:4,items:{type:"string"}},doNotUse:{type:"string"}},required:["name","slogan","position","palette","primaryFont","secondaryFont","visualDirection","composition","shapeLanguage","contrast","texture","logoStyle","monogramStyle","photoDirection","pattern","accentUse","applications","doNotUse"]};
  const prompt=`Tu es le directeur artistique senior de LUXURIID, spécialisé en identités visuelles premium. Ta mission est de transformer le brief en une identité de marque qui pourrait réellement être présentée à un client par une agence haut de gamme.\n\nBRIEF CLIENT\nMarque: ${brand}\nSecteur / activité: ${sector||"non précisé"}\nStyle recherché: ${style||"non précisé"}\nCible: ${audience||"non précisée"}\nDemande exacte: ${request}\nDirection choisie: ${directionName||"sur mesure"}\n\nOBJECTIF DE QUALITÉ\nLe résultat doit viser au minimum le niveau d'une planche de marque premium: logo distinctif, hiérarchie claire, palette maîtrisée, typographies cohérentes, langage de formes, matière, photographie, motifs et applications réelles. Il doit être SPÉCIFIQUE AU SECTEUR ET À LA DEMANDE, jamais un modèle générique. Une écurie doit avoir des codes équestres élégants; un restaurant, des codes gastronomiques; une entreprise tech, des codes technologiques; une marque beauté, des codes beauté; etc. Si le secteur est inhabituel, invente une direction visuelle pertinente à partir du brief.\n\nRÈGLES\n- Respecte strictement le brief et les contraintes du client.\n- Crée un concept de logo concret et mémorisable: symbole, monogramme ou wordmark selon ce qui sert le mieux la marque.\n- Le logo doit être simple, lisible, reproductible en petit format et suffisamment distinctif pour fonctionner sur enseigne, carte, textile, packaging et digital.\n- Évite les clichés gratuits et les symboles génériques. Chaque élément doit avoir une raison.\n- Palette de 4 HEX valides, avec rôles clairs (fond, secondaire, lumière, accent).\n- Décris une direction photo, une matière et un motif adaptés à l'activité.\n- Les applications doivent être concrètes et désirables: packaging, signalétique, textile, papeterie, interface, véhicule, objet, espace ou autre selon le secteur.\n- La direction doit fonctionner aussi bien en version claire que sombre lorsque pertinent.\n- Ne promets jamais la disponibilité juridique du logo.\n- Retourne uniquement le JSON du schéma.`;
  try{const response=await client.responses.create({model,input:prompt,text:{format:{type:"json_schema",name:"luxuriid_brand_kit",strict:true,schema}}});const data=JSON.parse((response.output_text||"").trim());data.palette=data.palette.map(c=>/^#[0-9a-fA-F]{6}$/.test(c)?c.toUpperCase():"#B8945B");res.json(data)}catch(e){console.error("AI ERROR:",e?.status,e?.code,e?.message||e);res.status(e?.status||500).json({error:e?.message||"La génération IA a échoué.",code:e?.code||e?.type||"unknown"})}
});

app.post("/api/brand-logo",async(req,res)=>{
  const {brand,sector,style,audience,request,directionName,kit}=req.body||{};
  if(!brand||!request)return res.status(400).json({error:"Le brief est incomplet."});
  if(!client)return res.status(500).json({error:"OPENAI_API_KEY manquante dans .env"});
  const k=kit||{};
  const prompt=`Design ONE exceptional PRIMARY LOGO for the exact client below. The logo itself is the product. Do not create a moodboard, brand board, poster, presentation slide, collage, mockup, website screenshot or decorative composition.

CLIENT
Brand name: ${brand}
Sector / activity: ${sector||"not specified"}
Style: ${style||"not specified"}
Audience: ${audience||"not specified"}
Client brief: ${request}
Creative direction: ${directionName||"custom"}

BRAND STRATEGY
Logo direction: ${k.logoStyle||"choose the most appropriate logo architecture"}
Monogram direction: ${k.monogramStyle||"choose only if useful"}
Visual direction: ${k.visualDirection||"premium, distinctive, sector-specific"}
Shape language: ${k.shapeLanguage||"refined and intentional"}
Palette: ${(k.palette||[]).join(", ")}

NON-NEGOTIABLE QUALITY BAR
- Think like a senior identity designer at a world-class branding studio.
- Create a genuinely custom visual idea derived from THIS business. Never reuse an equestrian, luxury or generic symbol when the client's sector is different.
- Prefer an intelligent combination of symbol + initials/wordmark when it creates a memorable identity.
- The symbol must be simple enough to reproduce, but sophisticated enough to feel proprietary.
- Use precise geometry, elegant proportions, controlled negative space and strong optical balance.
- The result must immediately look like a real finished logo, not AI concept art.
- The exact client name may appear once. Do not add slogans, explanations, fake text, random letters or unrelated words.
- Use a quiet solid background derived from the darkest brand color. The logo must dominate the image.
- Use the brand accent sparingly and intentionally; metallic-looking treatment is allowed only if it suits the brief.
- No generic circles, shields, crowns, leaves, stars, swooshes, random lines, blobs or decorative rings unless the brief specifically calls for them.
- No mockup, no stationery, no product scene, no collage, no photo, no 3D object, no giant decorative background.
- Center the finished logo with generous negative space. It should be immediately usable as the primary identity reference.

CRITICAL: This must be a single, polished logo presentation. The logo concept and visual language must adapt to the client's actual sector and request. The equestrian example is only a quality reference, never a subject to copy.`;
  try{
    const response=await client.images.generate({model:imageModel,prompt,size:"1024x1024",quality:"high"});
    const b64=response?.data?.[0]?.b64_json;
    if(!b64)throw new Error("Le logo IA est vide.");
    const cleanBuffer=Buffer.from(b64,"base64");
    const previewBuffer=await createWatermarkedPreview(cleanBuffer);
    const assetId=crypto.randomUUID();
    PRIVATE_ASSETS.set(assetId,{cleanBuffer,createdAt:Date.now()});
    res.json({image:`data:image/png;base64,${previewBuffer.toString("base64")}`,assetId});
  }catch(e){console.error("LOGO AI ERROR:",e?.status,e?.code,e?.message||e);res.status(e?.status||500).json({error:e?.message||"La génération du logo a échoué.",code:e?.code||e?.type||"unknown"})}
});

app.post("/api/brand-visual",async(req,res)=>{
  return res.status(403).json({
    error:"Cet endpoint n'est plus disponible. Utilisez le système de génération sécurisé LUXURIID."
  });
});


const PLANS={
  essential:{name:"LUXURIID – Identité Essentielle",amount:990,priceId:process.env.STRIPE_PRICE_ESSENTIAL||""},
  premium:{name:"LUXURIID – Identité Pro",amount:1990,priceId:process.env.STRIPE_PRICE_PREMIUM||""},
  studio:{name:"LUXURIID – Identité Premium",amount:2990,priceId:process.env.STRIPE_PRICE_STUDIO||""}
};
app.post("/api/create-checkout",async(req,res)=>{
  if(!stripe)return res.status(503).json({error:"Paiement Stripe non configuré. Configure STRIPE_SECRET_KEY dans .env."});
  const {plan="premium",brand="Projet LUXURIID",sector="",request="",assetId=""}=req.body||{};
  const p=PLANS[plan]||PLANS.premium;
  if(!assetId || !PRIVATE_ASSETS.has(assetId)) return res.status(400).json({error:"Aucun logo à débloquer. Génère d’abord ton logo IA."});
  try{
    const lineItem=p.priceId
      ? {price:p.priceId,quantity:1}
      : {price_data:{currency:"eur",unit_amount:p.amount,product_data:{name:p.name,description:`Branding IA LUXURIID · ${brand}`}},quantity:1};
    const session=await stripe.checkout.sessions.create({
      mode:"payment",
      line_items:[lineItem],
      success_url:`${SITE_URL}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
cancel_url:`${SITE_URL}/?payment=cancelled`,
      customer_creation:"always",
      locale:"fr",
      allow_promotion_codes:true,
      metadata:{plan,assetId,brand:brand.slice(0,100),sector:sector.slice(0,100),request:request.slice(0,300)}
    });
    rememberOrder({id:session.id,status:"created",plan,brand,createdAt:new Date().toISOString()});
    res.json({url:session.url,id:session.id});
  }catch(e){
    console.error("CHECKOUT ERROR:",e);
    res.status(500).json({error:e?.message||"Impossible de créer le paiement Stripe."});
  }
});
app.get("/api/checkout/verify",async(req,res)=>{
  if(!stripe)return res.status(503).json({paid:false,error:"Stripe non configuré"});
  try{
    const sessionId=String(req.query.session_id||"");
    const x=await stripe.checkout.sessions.retrieve(sessionId);
    const paid=x.payment_status==="paid";
    const assetId=x.metadata?.assetId||"";
    if(paid)rememberOrder({id:x.id,status:x.payment_status,plan:x.metadata?.plan||"",assetId,email:x.customer_details?.email||"",createdAt:new Date().toISOString()});
    res.json({paid,plan:x.metadata?.plan||null,assetId:paid?assetId:null,email:x.customer_details?.email||null});
  }catch(e){res.status(400).json({paid:false,error:"Session de paiement invalide."})}
});

app.get("/api/asset/clean",async(req,res)=>{
  if(!stripe)return res.status(503).json({error:"Stripe non configuré"});
  try{
    const sessionId=String(req.query.session_id||"");
    const assetId=String(req.query.asset_id||"");
    if(!sessionId || !assetId)return res.status(400).json({error:"Accès incomplet."});
    const session=await stripe.checkout.sessions.retrieve(sessionId);
    if(session.payment_status!=="paid" || session.metadata?.assetId!==assetId) return res.status(403).json({error:"Paiement non confirmé pour cet export."});
    const asset=PRIVATE_ASSETS.get(assetId);
    if(!asset)return res.status(410).json({error:"Cet export temporaire a expiré. Régénère le logo si nécessaire."});
    res.setHeader("Cache-Control","private, no-store");
    res.type("png").send(asset.cleanBuffer);
  }catch(e){res.status(403).json({error:"Accès à l’export refusé."})}
});

app.listen(PORT,"0.0.0.0",()=>console.log(`LUXURIID AI running on http://localhost:${PORT} · text: ${model} · image: ${imageModel} · stripe: ${stripe?"ON":"OFF"}`));
