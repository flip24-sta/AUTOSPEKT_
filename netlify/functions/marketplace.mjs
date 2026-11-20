import { json, db, getUser, readBody, userError, methodNotAllowed } from '../lib/shared.mjs';

const fields = 'id,seller_id,title,description,make,model,year,mileage_km,fuel,price_eur,city,image_urls,academy_priority,boost_until,created_at';
const clean = (value, max = 2000) => String(value ?? '').trim().slice(0, max);

export const handler = async (event) => {
  try {
    if (event.httpMethod === 'GET') {
      const p = event.queryStringParameters || {};
      const search = clean(p.q, 80).replace(/[(),.%_]/g, ' ');
      const query = new URLSearchParams({ select: fields, status: 'eq.active', order: 'academy_priority.desc,boost_until.desc.nullslast,created_at.desc', limit: '100' });
      if (search) query.set('or', `(title.ilike.*${search}*,make.ilike.*${search}*,model.ilike.*${search}*,city.ilike.*${search}*)`);
      return json(200, { listings: await db(`listings?${query}`) });
    }
    if (event.httpMethod === 'POST') {
      const user = await getUser(event);
      const data = readBody(event);
      const title = clean(data.title, 120);
      const price = Number(data.price_eur);
      if (title.length < 4 || !Number.isFinite(price) || price <= 0) return json(400, { error: 'Zadaj názov aspoň so 4 znakmi a platnú cenu.' });
      const year = Number(data.year) || null;
      if (year && (year < 1900 || year > new Date().getFullYear() + 1)) return json(400, { error: 'Rok výroby nie je platný.' });
      const purchases = await db(`purchases?user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&select=product`);
      const academy = purchases.some(p => ['sell', 'complete'].includes(p.product));
      const row = (await db('listings?select='+fields, { method:'POST', prefer:'return=representation', body:[{
        seller_id:user.id, title, description:clean(data.description,5000), make:clean(data.make,80), model:clean(data.model,100), year,
        mileage_km:Number(data.mileage_km)||null, fuel:clean(data.fuel,40), price_eur:price, city:clean(data.city,100),
        image_urls:Array.isArray(data.image_urls)?data.image_urls.filter(x=>typeof x==='string'&&x.startsWith('https://')).slice(0,8):[],
        academy_priority:academy, status:'active',
      }] }))[0];
      await db('usage_events', { method:'POST', prefer:'return=minimal', body:[{ user_id:user.id, event_name:'listing_published', details:{ listing_id:row.id, academy_priority:academy } }] });
      return json(201,{ listing:row });
    }
    if (event.httpMethod === 'DELETE') {
      const user = await getUser(event);
      const id = clean(event.queryStringParameters?.id, 50);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400,{error:'Neplatné ID inzerátu.'});
      await db(`listings?id=eq.${id}&seller_id=eq.${user.id}`,{method:'PATCH',prefer:'return=minimal',body:{status:'removed'}});
      return json(200,{removed:true});
    }
    return methodNotAllowed(['GET','POST','DELETE']);
  } catch (error) { return userError(error); }
};
