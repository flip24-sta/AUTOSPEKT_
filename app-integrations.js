(() => {
  const cfg = window.AUTOSPEKT_CONFIG || {};
  const configured = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase?.createClient);
  const app = document.querySelector('.app');
  const esc = (s='') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const authToken = async () => (await client.auth.getSession()).data.session?.access_token || '';
  const api = async (path, options={}) => {
    const token = await authToken();
    const response = await fetch(`/api/${path}`, { ...options, headers:{'content-type':'application/json', ...(token?{authorization:`Bearer ${token}`}:{}) , ...(options.headers||{})} });
    const data = await response.json().catch(()=>({error:'Server vrátil neplatnú odpoveď.'}));
    if (!response.ok) throw new Error(data.error || 'Požiadavka zlyhala.');
    return data;
  };
  const style = document.createElement('style');
  style.textContent = `
    .as-status{display:flex;align-items:center;gap:7px;border:1px solid #39434a;border-radius:999px;padding:7px 10px;color:#c2c9cd;background:#10161a;font-size:11px;font-weight:700;white-space:nowrap}.as-dot{width:7px;height:7px;background:#ff9c24;border-radius:99px}.as-status.live .as-dot{background:#12c55b;box-shadow:0 0 9px #12c55b88}
    .as-overlay{position:fixed;z-index:1000;inset:0;display:grid;place-items:center;background:#05080beF;padding:20px}.as-auth{width:min(440px,100%);border:1px solid #353e44;border-radius:18px;background:#11171c;padding:27px;box-shadow:0 25px 90px #0009}.as-auth h2{font:800 26px Manrope;margin:0 0 7px}.as-auth p{color:#aab3b8;line-height:1.55}.as-auth .field{margin:7px 0 12px}.as-auth-actions{display:flex;gap:9px;margin-top:10px}.as-auth-actions .btn{flex:1}.as-market-actions{display:flex;gap:7px;margin-top:10px}.as-market-actions .btn{font-size:11px;padding:8px}.as-photo-input{margin:8px 0 12px}.as-status-banner{margin:12px 32px 0;padding:10px 14px;border:1px solid #74521f;border-radius:10px;background:#21190f;color:#f0c886;font-size:12px}
    .as-authbtn{border:0;border-radius:999px;padding:9px 15px;background:var(--orange,#ff7a1a);color:#111;font-weight:800;font-size:13px;white-space:nowrap;cursor:pointer}.as-authbtn.out{background:#1b232a;color:#e6ebee;border:1px solid #39434a}.as-auth-close{margin-top:14px;background:none;border:0;color:#aab3b8;text-decoration:underline;cursor:pointer;width:100%}
    @media(max-width:700px){.as-status{display:none}.as-authbtn{padding:8px 11px;font-size:12px}.as-status-banner{margin:10px 14px}}
  `;
  document.head.append(style);
  const status = document.createElement('div');
  status.className = `as-status ${configured?'':'demo'}`;
  status.innerHTML = `<i class="as-dot"></i><span>${configured?'Backend pripravený':'Demo · backend nepripojený'}</span>`;
  document.querySelector('.topright')?.prepend(status);
  const authBtn = document.createElement('button');
  authBtn.type = 'button';
  authBtn.className = 'as-authbtn';
  authBtn.textContent = 'Prihlásiť sa / Registrácia';
  document.querySelector('.topright')?.prepend(authBtn);
  const setUserLabel = (name) => {
    const top = document.querySelector('#userNameTop'); if (top) top.textContent = name || 'Hosť';
    const ini = document.querySelector('#userInitials');
    if (ini) ini.textContent = name ? name.split(/[\s@.]+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('') : '?';
  };
  setUserLabel('');
  const banner = document.createElement('div');
  banner.className = 'as-status-banner';
  banner.innerHTML = configured
    ? 'AUTOSPEKT je pripojený k používateľskej databáze. Platby, register a e-mailové upozornenia sa aktivujú po nastavení príslušných kľúčov v Netlify.'
    : 'Demo režim: pred reálnym používaním nastav Supabase, Stripe, licencovaný register vozidiel a e-mailový účet. Zatiaľ sa nič neodosiela ani neschvaľuje ako overený údaj.';
  document.querySelector('.main')?.insertBefore(banner, document.querySelector('.main').children[1] || null);

  if (!configured) {
    authBtn.onclick = () => alert('Prihlásenie a registrácia zatiaľ nefungujú: stránka ešte nie je pripojená k databáze (Supabase). Po nastavení kľúčov v Netlify sa zapnú automaticky.');
    window.AUTOSPEKT_LIVE = false;
    return;
  }

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true },
    realtime: { params:{ eventsPerSecond:5 } },
  });
  window.AUTOSPEKT_SUPABASE = client;
  window.AUTOSPEKT_LIVE = true;
  let currentUser = null, activeConversation = null, realtimeChannel = null;

  function showAuth(message='Prihlás sa alebo si vytvor účet.') {
    let overlay=document.querySelector('.as-overlay');
    if (!overlay) {
      overlay=document.createElement('div'); overlay.className='as-overlay';
      overlay.innerHTML=`<section class="as-auth"><div class="brand-word">AUTO<em style="color:var(--orange)">SPEKT</em></div><h2>Zabezpečený portál</h2><p data-auth-message></p><label class="label" for="asEmail">E-mail</label><input class="field" id="asEmail" type="email" autocomplete="email" required placeholder="meno@firma.sk"><label class="label" for="asPassword">Heslo</label><input class="field" id="asPassword" type="password" autocomplete="current-password" required minlength="8" placeholder="Aspoň 8 znakov"><div class="as-auth-actions"><button class="btn" id="asSignIn">Prihlásiť sa</button><button class="btn primary" id="asSignUp">Vytvoriť účet</button></div><button class="textlink" id="asForgot" style="margin-top:14px">Zabudnuté heslo</button></section>`;
      document.body.append(overlay);
      const close=document.createElement('button');close.type='button';close.className='as-auth-close';close.textContent='Zavrieť a len si prezerať';close.onclick=hideAuth;overlay.querySelector('.as-auth').append(close);
      const values=()=>({email:document.querySelector('#asEmail').value.trim(),password:document.querySelector('#asPassword').value});
      const msg=overlay.querySelector('[data-auth-message]');
      overlay.querySelector('#asSignIn').onclick=async()=>{const v=values();try{const {error}=await client.auth.signInWithPassword(v);if(error)throw error;overlay.remove()}catch(e){msg.textContent=e.message}};
      overlay.querySelector('#asSignUp').onclick=async()=>{const v=values();try{const {data,error}=await client.auth.signUp({...v,options:{emailRedirectTo:`${location.origin}/`,data:{display_name:v.email.split('@')[0]}}});if(error)throw error;msg.textContent=data.session?'Účet je pripravený.':'Skontroluj e-mail a potvrď registráciu.'}catch(e){msg.textContent=e.message}};
      overlay.querySelector('#asForgot').onclick=async()=>{const {email}=values();if(!email){msg.textContent='Najprv zadaj e-mail.';return}const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}/`});msg.textContent=error?.message||'Odkaz na obnovu hesla sme poslali e-mailom.'};
    }
    overlay.querySelector('[data-auth-message]').textContent=message;
    if(app)app.inert=true;
  }
  function hideAuth(){document.querySelector('.as-overlay')?.remove();if(app)app.inert=false}

  async function loadProfile(user) {
    const {data,error}=await client.from('profiles').select('*').eq('id',user.id).maybeSingle();
    if(error)throw error;
    if(!data){const {error:upsertError}=await client.from('profiles').upsert({id:user.id,email:user.email||'',display_name:user.user_metadata?.display_name||'',city:'Slovensko'});if(upsertError)throw upsertError;setUserLabel(user.user_metadata?.display_name||user.email?.split('@')[0]||'');return}
    const name=data.display_name||user.email?.split('@')[0]||'Používateľ';setUserLabel(name);
    if(typeof state !== 'undefined'){state.profile.name=name;state.profile.email=data.email||user.email||'';state.profile.location=data.city||'Slovensko';}
    document.querySelector('#userNameTop').textContent=name;
    document.querySelector('#profileName').value=name;
    document.querySelector('#profileEmail').value=data.email||user.email||'';
    document.querySelector('#profileLocation').value=data.city||'Slovensko';
  }
  async function loadEntitlements(){
    const {data,error}=await client.from('purchases').select('product,status,purchased_at').eq('status','active').order('purchased_at',{ascending:false});
    if(error)throw error;
    const products=new Set((data||[]).map(x=>x.product));
    const plan=products.has('complete')?'full':products.has('sell')?'sell':products.has('buy')?'buy':'free';
    if(typeof state !== 'undefined'){state.plan=plan;window.persist?.();window.renderPlans?.();window.renderCourses?.();window.renderVehicles?.();}
    return products;
  }
  async function loadRemoteChecklists(){
    const {data,error}=await client.from('checklists').select('id,title,vin,plate,payload,updated_at').order('updated_at',{ascending:false});
    if(error)throw error;
    const local=JSON.parse(localStorage.getItem('autospekt_check_records_v1')||'[]');
    const byLocalId=new Map(local.map(record=>[String(record.id),record]));
    const remote=[];
    for(const row of data||[]){
      const p=row.payload||{}, id=String(p.local_id||row.id), old=byLocalId.get(id), photos={...(old?.photos||{})};
      if(!old&&p.photo_paths){
        for(const [group,paths] of Object.entries(p.photo_paths)){
          const urls=[];
          for(const path of paths||[]){const {data:signed,error:signedError}=await client.storage.from('checklist-photos').createSignedUrl(path,3600);if(!signedError&&signed?.signedUrl)urls.push(signed.signedUrl)}
          photos[group]=urls;
        }
      }
      remote.push({id,title:row.title,date:p.date,vin:row.vin,plate:row.plate,mileage:p.fields?.mileage||'',fields:p.fields||{},photos,updatedAt:row.updated_at});
    }
    const remoteIds=new Set(remote.map(x=>String(x.id)));
    const combined=[...remote,...local.filter(x=>!remoteIds.has(String(x.id)))];
    localStorage.setItem('autospekt_check_records_v1',JSON.stringify(combined));
    window.renderSavedChecks?.();window.renderVehicles?.();
  }
  const photoUrls=[];
  async function uploadListingPhotos(files) {
    photoUrls.length=0;
    for(const file of [...files].slice(0,8)){
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)throw new Error('Fotky musia byť JPG, PNG alebo WebP do 8 MB/kus.');
      const path=`${currentUser.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
      const {error}=await client.storage.from('vehicle-listings').upload(path,file,{upsert:false,contentType:file.type});if(error)throw error;
      photoUrls.push(client.storage.from('vehicle-listings').getPublicUrl(path).data.publicUrl);
    }
    return photoUrls;
  }
  function showFormError(msg){let box=document.querySelector('#asFormError');if(!box){box=document.createElement('div');box.id='asFormError';box.setAttribute('role','alert');box.style.cssText='margin-top:12px;padding:11px 13px;border-radius:10px;background:#3a1414;border:1px solid #a33;color:#ffd6d6;font-weight:700';document.querySelector('#modalBody')?.append(box)}box.textContent='Inzerát sa neuložil: '+msg;box.scrollIntoView({block:'nearest'})}
  async function openLiveListing() {
    if(!currentUser){showAuth('Na pridanie inzerátu sa prihlás alebo si vytvor účet.');return}
    loadEntitlements().catch(e=>console.warn('Balíky sa nenačítali:',e.message));
    openModal('Publikovať vozidlo',`<div class="row"><div><label class="label">Názov inzerátu</label><input class="field" id="adName" maxlength="120" placeholder="Škoda Octavia 2.0 TDI DSG"></div><div><label class="label">Cena (€)</label><input class="field" id="adPrice" type="number" min="1" placeholder="18 490"></div></div><div class="row3"><div><label class="label">Rok</label><input class="field" id="adYear" type="number" placeholder="2018"></div><div><label class="label">Kilometre</label><input class="field" id="adKm" type="number" placeholder="147 000"></div><div><label class="label">Palivo</label><select class="field" id="adFuel"><option>Diesel</option><option>Benzín</option><option>Hybrid</option><option>Elektro</option><option>LPG</option></select></div></div><label class="label">Mesto</label><input class="field" id="adCity" placeholder="Nitra"><label class="label">Opis</label><textarea class="field" id="adDesc" rows="4" maxlength="5000" placeholder="Servisná história, výbava, stav, známe nedostatky…"></textarea><label class="label">Fotografie (max. 8, JPG/PNG/WebP, 8 MB na fotku)</label><input class="field as-photo-input" id="adPhotos" type="file" accept="image/jpeg,image/png,image/webp" multiple><div class="notice">Priorita členov Academy sa nastaví serverovo podľa potvrdeného nákupu. Údaj si nemožno ručne zapnúť vo formulári.</div>`,[['Zrušiť',closeModal,'btn'],['Publikovať',async()=>{try{const title=document.querySelector('#adName').value.trim(),price=Number(document.querySelector('#adPrice').value);if(title.length<4||price<=0)throw new Error('Doplň názov a platnú cenu.');const images=await uploadListingPhotos(document.querySelector('#adPhotos').files);const parts=title.split(/\s+/);const data=await api('marketplace',{method:'POST',body:JSON.stringify({title,price_eur:price,year:document.querySelector('#adYear').value,mileage_km:document.querySelector('#adKm').value,fuel:document.querySelector('#adFuel').value,city:document.querySelector('#adCity').value,description:document.querySelector('#adDesc').value,make:parts.shift()||'',model:parts.join(' '),image_urls:images})});closeModal();await renderLiveMarket();go('ads');toast(data.listing.academy_priority?'Inzerát zverejnený s výhodou Academy.':'Inzerát je zverejnený. Academy zvýhodnenie sa aktivuje po zakúpení balíka Predaj alebo Kompletný.')}catch(e){showFormError(e.message)}} ,'btn primary']]);
  }
  async function renderLiveMarket(query=''){
    try{
      const data=await api(`marketplace${query?`?q=${encodeURIComponent(query)}`:''}`);
      const rows=data.listings||[];
      const html=rows.map(x=>`<article class="ad"><div class="ad-photo" style="background-image:url('${esc(x.image_urls?.[0]||'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=900&q=80')}')"></div>${x.academy_priority?'<div class="adtag">♛ TOP – Academy</div>':''}<div class="ad-body"><h3>${esc(x.title)}</h3><div class="hint">${esc(x.year||'—')} · ${Number(x.mileage_km||0).toLocaleString('sk-SK')} km · ${esc(x.city||'Slovensko')}</div><div class="ad-bottom"><span class="price">${Number(x.price_eur).toLocaleString('sk-SK')} €</span><span class="views">${esc(x.fuel||'')}</span></div><div class="as-market-actions"><button class="btn primary small" data-contact="${esc(x.id)}" data-seller="${esc(x.seller_id)}">Napísať predajcovi</button>${x.seller_id===currentUser.id?'<button class="btn small" data-remove-listing="'+esc(x.id)+'">Odobrať</button>':''}</div></div></article>`).join('')||'<div class="empty">Zatiaľ tu nie sú aktívne inzeráty. Pridaj prvý.</div>';
      for(const id of ['allAds','homeAds','favoriteAds']){const el=document.querySelector(`#${id}`);if(el)el.innerHTML=html;}
      document.querySelectorAll('[data-contact]').forEach(b=>b.onclick=()=>contactSeller(b.dataset.contact,b.dataset.seller));
      document.querySelectorAll('[data-remove-listing]').forEach(b=>b.onclick=async()=>{try{await api(`marketplace?id=${encodeURIComponent(b.dataset.removeListing)}`,{method:'DELETE'});await renderLiveMarket();toast('Inzerát bol odobratý.')}catch(e){toast(e.message)}});
    }catch(e){console.error(e);for(const id of ['allAds','homeAds','favoriteAds']){const el=document.querySelector(`#${id}`);if(el)el.innerHTML=`<div class="empty">${esc(e.message)}</div>`}}
  }
  async function contactSeller(listingId,recipientId){
    const listing=(await client.from('listings').select('title').eq('id',listingId).maybeSingle()).data;
    openModal('Správa predajcovi',`<p>Vozidlo: <b>${esc(listing?.title||'Inzerát')}</b></p><label class="label">Tvoja správa</label><textarea class="field" id="firstMessage" rows="4" maxlength="5000" placeholder="Dobrý deň, mám záujem o vozidlo…"></textarea><p class="hint">Odpoveď sa doručí v zabezpečenej schránke; e-mailové upozornenie závisí od nastavenia odosielateľa.</p>`,[['Zrušiť',closeModal,'btn'],['Odoslať',async()=>{try{await api('messages',{method:'POST',body:JSON.stringify({listing_id:listingId,recipient_id:recipientId,body:document.querySelector('#firstMessage').value})});closeModal();go('messages');await loadMessages();toast('Správa uložená a doručená do schránky predajcu.')}catch(e){toast(e.message)}} ,'btn primary']]);
  }
  async function loadMessages(selectedId=activeConversation){
    try{
      const {conversations=[]}=await api('messages');
      const threads=document.querySelector('.threads');
      if(!threads)return;
      threads.innerHTML=conversations.map(c=>`<button class="thread ${c.id===selectedId?'active':''}" data-thread="${esc(c.id)}">${esc(c.listing?.title||'Vozidlo')} · ${esc(c.other?.display_name||'Používateľ')}</button>`).join('')||'<div class="empty">Zatiaľ nemáš správy k inzerátom.</div>';
      threads.querySelectorAll('[data-thread]').forEach(b=>b.onclick=()=>{activeConversation=b.dataset.thread;loadMessages(activeConversation)});
      activeConversation=conversations.some(c=>c.id===selectedId)?selectedId:conversations[0]?.id||null;
      const conv=conversations.find(c=>c.id===activeConversation), chat=document.querySelector('#chat');
      if(!chat)return;
      chat.innerHTML=conv?`${conv.messages.map(m=>`<div class="bubble ${m.sender_id===currentUser.id?'mine':''}">${esc(m.body)}<small style="display:block;opacity:.6;margin-top:6px">${new Date(m.created_at).toLocaleString('sk-SK')}</small></div>`).join('')}<div class="chatform"><input class="field" id="chatInput" placeholder="Napíš odpoveď…"><button class="btn primary" id="sendMessage">Poslať</button></div>`:'<div class="empty">Vyber konverzáciu alebo najprv kontaktuj predajcu z marketplace.</div>';
      document.querySelector('#sendMessage')?.addEventListener('click',sendActiveMessage);
      document.querySelector('#chatInput')?.addEventListener('keydown',e=>{if(e.key==='Enter')sendActiveMessage()});
    }catch(e){console.error(e);toast('Schránku sa nepodarilo načítať: '+e.message)}
  }
  async function sendActiveMessage(){const input=document.querySelector('#chatInput');if(!input?.value.trim()||!activeConversation)return;try{await api('messages',{method:'POST',body:JSON.stringify({conversation_id:activeConversation,body:input.value})});await loadMessages(activeConversation)}catch(e){toast(e.message)}}
  async function startRealtime(){
    if(realtimeChannel)await client.removeChannel(realtimeChannel);
    realtimeChannel=client.channel(`user-messages-${currentUser.id}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},payload=>{if(payload.new.sender_id!==currentUser.id)loadMessages(activeConversation)}).subscribe();
  }
  authBtn.onclick=async()=>{if(currentUser){await client.auth.signOut();toast('Boli ste odhlásený.')}else showAuth()};
  async function onSession(session){
    currentUser=session?.user||null;
    authBtn.textContent=currentUser?'Odhlásiť sa':'Prihlásiť sa / Registrácia';authBtn.classList.toggle('out',!!currentUser);
    if(!currentUser){setUserLabel('');const st=document.querySelector('.as-status');st?.classList.remove('live');if(st)st.querySelector('span').textContent='Backend pripravený';showAuth();return}
    hideAuth();document.querySelector('.as-status span').textContent=`Pripojený · ${currentUser.email}`;document.querySelector('.as-status').classList.add('live');
    for(const [label,step] of [['profil',()=>loadProfile(currentUser)],['balíky',loadEntitlements],['checklisty',loadRemoteChecklists],['inzeráty',renderLiveMarket],['správy',()=>loadMessages()],['upozornenia',startRealtime]]){try{await step()}catch(e){console.error('AUTOSPEKT '+label+':',e);toast('Nepodarilo sa načítať '+label+': '+(e.message||e))}}
  }
  client.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>onSession(session).catch(e=>toast('Chyba účtu: '+e.message)),0)});
  client.auth.getSession().then(({data})=>onSession(data.session).catch(e=>showAuth(e.message)));

  // Intercept prototype-only actions so production requests never fall back to local demo writes.
  document.addEventListener('click',e=>{
    const plan=e.target.closest('[data-plan]');
    if(plan){e.preventDefault();e.stopImmediatePropagation();const product=plan.dataset.plan;if(product==='free'||plan.textContent.includes('aktuálny balík'))return;const productId=product==='full'?'complete':product;api('create-checkout',{method:'POST',body:JSON.stringify({product:productId})}).then(x=>location.assign(x.url)).catch(err=>toast(err.message));return;}
    const newAd=e.target.closest('[data-action="newAd"]');
    if(newAd){e.preventDefault();e.stopImmediatePropagation();openLiveListing().catch(err=>alert('Formulár sa nepodarilo otvoriť: '+err.message));return;}
    const lookup=e.target.closest('#lookupVehicle,[data-action="vin"]');
    if(lookup){e.preventDefault();e.stopImmediatePropagation();go('checklist');setTimeout(async()=>{const vin=document.querySelector('[data-check="vin"]')?.value||'',plate=document.querySelector('[data-check="plate"]')?.value||'';if(!vin&&!plate){document.querySelector('[data-check="vin"]')?.focus();toast('Zadaj VIN alebo EČV a spusti overenie znova.');return}try{const data=await api('vehicle-lookup',{method:'POST',body:JSON.stringify({vin,plate,country:'SK'})});openModal('Výsledok overenia',`<pre style="white-space:pre-wrap;max-height:55vh;overflow:auto;font-size:11px;color:#d9dedf">${esc(JSON.stringify(data.result,null,2))}</pre><div class="notice">Zdroj: ${esc(data.source)} · ${new Date(data.checkedAt).toLocaleString('sk-SK')}<br>${esc(data.disclaimer)}</div>`,[['Zavrieť',closeModal,'btn primary']])}catch(err){openModal('Overenie vozidla',`<div class="notice">${esc(err.message)}</div><p class="hint">Slovenské registre sprístupňujú citlivé údaje len v rozsahu povolenom zdrojom. Nejde o výsledok overenia, kým nie je pripojený licencovaný poskytovateľ.</p>`,[['Zavrieť',closeModal,'btn primary']])}},40);return;}
    if(e.target.closest('#sendMessage')){e.preventDefault();e.stopImmediatePropagation();sendActiveMessage();}
  },true);

  document.querySelector('#globalSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();const q=e.target.value.trim();renderLiveMarket(q);go('ads')}},true);
  document.querySelector('#saveProfile')?.addEventListener('click',async()=>{if(!currentUser)return;const profile={id:currentUser.id,display_name:document.querySelector('#profileName').value.trim(),email:document.querySelector('#profileEmail').value.trim(),city:document.querySelector('#profileLocation').value.trim()};const {error}=await client.from('profiles').upsert(profile);if(error)toast('Profil sa neuložil: '+error.message)},true);
  document.querySelector('#finishChecklist')?.addEventListener('click',()=>setTimeout(async()=>{if(!currentUser)return;try{const records=JSON.parse(localStorage.getItem('autospekt_check_records_v1')||'[]');const latest=records.reduce((best,item)=>!best||String(item.updatedAt||'')>String(best.updatedAt||'')?item:best,null);if(!latest)return;const photoPaths={};for(const [group,images] of Object.entries(latest.photos||{})){photoPaths[group]=[];for(let i=0;i<images.length;i++){const blob=await(await fetch(images[i])).blob();const ext=blob.type==='image/png'?'png':'jpg';const path=`${currentUser.id}/${latest.id}/${group.replace(/[^a-zA-Z0-9_-]/g,'_')}-${i}.${ext}`;const{error:uploadError}=await client.storage.from('checklist-photos').upload(path,blob,{upsert:true,contentType:blob.type||'image/jpeg'});if(uploadError)throw uploadError;photoPaths[group].push(path)}}const payload={...latest,photos:{},photo_paths:photoPaths,local_id:latest.id};const {data:old}=await client.from('checklists').select('id').eq('user_id',currentUser.id).filter('payload->>local_id','eq',String(latest.id)).maybeSingle();const row={user_id:currentUser.id,title:latest.title||'Kontrola vozidla',vin:latest.vin||null,plate:latest.plate||null,payload};const res=old?await client.from('checklists').update(row).eq('id',old.id):await client.from('checklists').insert(row);if(res.error)throw res.error;toast('Checklist a fotografie uložené v účte.')}catch(e){toast('Checklist sa do databázy neuložil: '+e.message)}},100));

  const params=new URLSearchParams(location.search);
  if(params.get('payment')==='success')setTimeout(async()=>{try{await loadEntitlements();toast('Platba potvrdená. Prístup bol aktualizovaný cez Stripe webhook.')}catch{}history.replaceState({},'',location.pathname)},1000);
  if(params.get('payment')==='cancelled')setTimeout(()=>{toast('Platba bola zrušená.');history.replaceState({},'',location.pathname)},500);
})();
