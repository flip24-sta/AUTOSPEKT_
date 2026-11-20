import { json, getUser, readBody, userError, methodNotAllowed } from '../lib/shared.mjs';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  try {
    const user=await getUser(event);
    const { vin, plate, country = 'SK' } = readBody(event);
    const cleanVin = String(vin || '').trim().toUpperCase();
    const cleanPlate = String(plate || '').replace(/[\s-]/g, '').toUpperCase();
    if (!cleanVin && !cleanPlate) return json(400, { error: 'Zadaj VIN alebo EČV.' });
    if (cleanVin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(cleanVin)) return json(400, { error: 'VIN musí obsahovať 17 platných znakov.' });
    if (!process.env.VEHICLE_API_URL || !process.env.VEHICLE_API_KEY) return json(503, { error: 'Register zatiaľ nie je zapnutý. Prevádzkovateľ musí uzavrieť zmluvu s licencovaným poskytovateľom a vložiť jeho API prístup do Netlify.' });
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return json(503,{error:'Databázové limity overení nie sú nakonfigurované.'});
    const since=new Date(Date.now()-24*60*60*1000).toISOString();
    const recent=await fetch(`${process.env.SUPABASE_URL}/rest/v1/usage_events?user_id=eq.${user.id}&event_name=eq.vehicle_lookup&created_at=gte.${encodeURIComponent(since)}&select=id&limit=26`,{headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`}});
    if(!recent.ok)return json(503,{error:'Limit overení sa nepodarilo overiť. Register zatiaľ nespustíme.'});
    if((await recent.json()).length>=25)return json(429,{error:'Denný limit overení bol dosiahnutý. Skús znova zajtra.'});
    const eventKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
    const usage=await fetch(`${process.env.SUPABASE_URL}/rest/v1/usage_events`,{method:'POST',headers:{apikey:eventKey,authorization:`Bearer ${eventKey}`,'content-type':'application/json',prefer:'return=minimal'},body:JSON.stringify([{user_id:user.id,event_name:'vehicle_lookup',details:{country:String(country).toUpperCase(),lookup_by:cleanVin?'vin':'plate'}}])});
    if(!usage.ok)return json(503,{error:'Overenie sa nepodarilo zapísať do účtovných limitov.'});

    const header = process.env.VEHICLE_API_AUTH_HEADER || 'Authorization';
    const scheme = process.env.VEHICLE_API_AUTH_SCHEME;
    const credential = scheme ? `${scheme} ${process.env.VEHICLE_API_KEY}` : process.env.VEHICLE_API_KEY;
    const response = await fetch(process.env.VEHICLE_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [header]: credential },
      body: JSON.stringify({ vin: cleanVin || undefined, plate: cleanPlate || undefined, country: String(country).toUpperCase() }),
    });
    if (!response.ok) return json(response.status === 429 ? 429 : 502, { error: 'Poskytovateľ registra momentálne nevrátil použiteľný výsledok.' });
    const data = await response.json();
    return json(200, { result: data, source: 'licencovaný poskytovateľ', checkedAt: new Date().toISOString(), disclaimer: 'Rozsah a aktuálnosť údajov závisia od zdroja. Výsledok nenahrádza fyzickú obhliadku ani úradný doklad.' });
  } catch (error) { return userError(error); }
};
