import { json, db, getUser, readBody, userError, methodNotAllowed } from '../lib/shared.mjs';

const clean = (value, max = 5000) => String(value ?? '').trim().slice(0, max);

async function deliverEmail(toUserId, senderName, listingTitle, body) {
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) return 'not_configured';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const auth = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users/${toUserId}`, { headers:{apikey:key, authorization:`Bearer ${key}`} });
  if (!auth.ok) return 'failed';
  const recipient = await auth.json();
  if (!recipient.email) return 'failed';
  const response = await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${process.env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({
    from:process.env.MAIL_FROM,to:[recipient.email],subject:`Nová správa k inzerátu ${listingTitle}`,
    text:`Používateľ ${senderName} vám poslal správu k vozidlu „${listingTitle}“:\n\n${body}\n\nOtvorte AUTOSPEKT Academy a odpovedzte v zabezpečenej konverzácii.`,
  })});
  return response.ok ? 'sent' : 'failed';
}

export const handler = async (event) => {
  try {
    const user = await getUser(event);
    if (event.httpMethod === 'GET') {
      const conversations = await db(`conversations?or=(participant_a.eq.${user.id},participant_b.eq.${user.id})&select=id,listing_id,participant_a,participant_b,last_message_at&order=last_message_at.desc`);
      const ids = conversations.map(c=>c.id);
      const [listings, messages] = ids.length ? await Promise.all([
        db(`listings?id=in.(${[...new Set(conversations.map(c=>c.listing_id))].join(',')})&select=id,title,make,model`),
        db(`messages?conversation_id=in.(${ids.join(',')})&select=id,conversation_id,sender_id,body,email_status,created_at&order=created_at.asc&limit=1000`),
      ]) : [[],[]];
      const others = [...new Set(conversations.map(c => c.participant_a === user.id ? c.participant_b : c.participant_a))];
      const profiles = others.length ? await db(`profiles?id=in.(${others.join(',')})&select=id,display_name`) : [];
      return json(200,{conversations:conversations.map(c=>({ ...c, listing:listings.find(l=>l.id===c.listing_id), other:profiles.find(p=>p.id===(c.participant_a===user.id?c.participant_b:c.participant_a)), messages:messages.filter(m=>m.conversation_id===c.id) }))});
    }
    if (event.httpMethod === 'POST') {
      const { conversation_id, listing_id, recipient_id, body } = readBody(event);
      const message = clean(body);
      if (!message) return json(400,{error:'Napíš text správy.'});
      let conversation;
      if (conversation_id) {
        if (!/^[0-9a-f-]{36}$/i.test(conversation_id)) return json(400,{error:'Neplatná konverzácia.'});
        conversation = (await db(`conversations?id=eq.${conversation_id}&or=(participant_a.eq.${user.id},participant_b.eq.${user.id})&select=*`))[0];
      } else {
        if (!/^[0-9a-f-]{36}$/i.test(listing_id||'') || !/^[0-9a-f-]{36}$/i.test(recipient_id||'')) return json(400,{error:'Chýba inzerát alebo príjemca.'});
        const listing=(await db(`listings?id=eq.${listing_id}&status=eq.active&select=id,seller_id,title`))[0];
        if (!listing || listing.seller_id!==recipient_id || recipient_id===user.id) return json(404,{error:'Inzerát alebo príjemca sa nenašiel.'});
        const pair=[user.id,recipient_id].sort();
        conversation=(await db('conversations?on_conflict=listing_id,participant_a,participant_b&select=*',{method:'POST',prefer:'resolution=merge-duplicates,return=representation',body:[{listing_id,participant_a:pair[0],participant_b:pair[1]}]}))[0];
      }
      if (!conversation || ![conversation.participant_a,conversation.participant_b].includes(user.id)) return json(404,{error:'Konverzácia neexistuje.'});
      const row=(await db('messages?select=*',{method:'POST',prefer:'return=representation',body:[{conversation_id:conversation.id,sender_id:user.id,body:message}]}))[0];
      await db(`conversations?id=eq.${conversation.id}`,{method:'PATCH',prefer:'return=minimal',body:{last_message_at:row.created_at}});
      const target=conversation.participant_a===user.id?conversation.participant_b:conversation.participant_a;
      const [listing,profile]=await Promise.all([
        db(`listings?id=eq.${conversation.listing_id}&select=title`),
        db(`profiles?id=eq.${user.id}&select=display_name`),
      ]);
      const email_status=await deliverEmail(target,profile[0]?.display_name||user.email||'Používateľ',listing[0]?.title||'vozidlu',message);
      await db(`messages?id=eq.${row.id}`,{method:'PATCH',prefer:'return=minimal',body:{email_status}});
      await db('notifications',{method:'POST',prefer:'return=minimal',body:[{user_id:target,kind:'message',title:'Nová správa',body:`Správa k inzerátu ${listing[0]?.title||''}`}]});
      await db('usage_events',{method:'POST',prefer:'return=minimal',body:[{user_id:user.id,event_name:'message_sent',details:{conversation_id:conversation.id}}]});
      return json(201,{conversation_id:conversation.id,message:{...row,email_status}});
    }
    return methodNotAllowed(['GET','POST']);
  } catch (error) { return userError(error); }
};
