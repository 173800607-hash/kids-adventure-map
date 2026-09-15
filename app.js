/* V0.7: all text is stored in localStorage; photo and voice blobs stay in this browser's IndexedDB. */
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const STORAGE = 'kids-adventure-growth-v07';
const DB_NAME = 'kids-adventure-growth-media-v07';
const STORE = 'media';
const scenes = ['公园','动物园','游乐园','博物馆','自然户外','城市探索','旅行','回老家','自由探索'];
const interests = ['恐龙','动物','颜色','机器','昆虫','自然','声音','交通工具'];
const defaults = { profile: { name: '晗晗', age: '5' }, adventures: [] };
let state = load(); let currentId = null; let selectedScene = ''; let selectedInterest = ''; let mode = 'auto';
let recorder; let stream; let chunks = []; let timer; let urls = [];

function load() { try { return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE)), profile: { ...defaults.profile, ...JSON.parse(localStorage.getItem(STORAGE)).profile } }; } catch { return structuredClone(defaults); } }
function save() { localStorage.setItem(STORAGE, JSON.stringify(state)); }
function id() { return `${Date.now()}-${Math.random().toString(36).slice(2,7)}`; }
function adventure() { return state.adventures.find(a => a.id === currentId); }
function clean(text) { return String(text || '').replace(/[<>&]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;' }[c])); }
function dateText(date) { return new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'long',day:'numeric'}).format(new Date(date)); }
function show(view) { $$('.view').forEach(v => v.classList.toggle('is-active', v.id === `${view}-view`)); window.scrollTo({top:0, behavior:'instant'}); }
function toast(text) { const el = $('#toast'); el.textContent = text; el.classList.add('is-visible'); clearTimeout(el.timer); el.timer = setTimeout(() => el.classList.remove('is-visible'), 2200); }
function db() { return new Promise((resolve,reject) => { const req = indexedDB.open(DB_NAME,1); req.onupgradeneeded = () => req.result.createObjectStore(STORE,{keyPath:'id'}); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
async function putMedia(item) { const database = await db(); return new Promise((resolve,reject) => { const req = database.transaction(STORE,'readwrite').objectStore(STORE).put(item); req.onsuccess = () => resolve(); req.onerror = () => reject(req.error); }); }
async function getMedia(mediaId) { if (!mediaId) return null; const database = await db(); return new Promise(resolve => { const req = database.transaction(STORE).objectStore(STORE).get(mediaId); req.onsuccess = () => resolve(req.result?.blob || null); req.onerror = () => resolve(null); }); }
async function deleteMedia(mediaId) { const database = await db(); return new Promise(resolve => { const req = database.transaction(STORE,'readwrite').objectStore(STORE).delete(mediaId); req.onsuccess = () => resolve(); req.onerror = () => resolve(); }); }
function blobUrl(blob) { const url = URL.createObjectURL(blob); urls.push(url); return url; }
function clearUrls() { urls.forEach(URL.revokeObjectURL); urls = []; }
function templates(scene, interest) {
  const place = scene || '今天去的地方'; const subject = interest ? `和「${interest}」有关的` : '';
  return [`有没有一个${subject}东西，让你忍不住想问“为什么”？`, `今天在${place}，有没有什么是你以前没有注意过的？`, '有没有一个声音、颜色或味道，让你特别想停下来看看？', '如果今天只能记住一个瞬间，你会选哪个？'];
}
function renderChoices() {
  $('#scene-choices').innerHTML = scenes.map(x => `<button class="choice ${x===selectedScene?'is-selected':''}" data-scene="${x}" type="button">${x}</button>`).join('');
  $('#interest-choices').innerHTML = interests.map(x => `<button class="choice ${x===selectedInterest?'is-selected':''}" data-interest="${x}" type="button">${x}</button>`).join('');
}
async function renderHome() {
  const archived = state.adventures.filter(a => a.archived);
  const discoveries = archived.flatMap(a => a.records.discoveries || []);
  const questions = archived.flatMap(a => a.records.questions || []);
  const firsts = archived.flatMap(a => a.records.firsts || []);
  $('#profile-name').textContent = state.profile.name; $('#profile-age').textContent = `${state.profile.age || '5'} 岁`; $('#profile-avatar').textContent = state.profile.name.slice(0,1) || '我';
  $('#adventure-count').textContent = archived.length; $('#discovery-count').textContent = discoveries.length; $('#question-count').textContent = questions.length; $('#first-count').textContent = firsts.length;
  $('#empty-history').hidden = archived.length > 0;
  const list = $('#history-list'); clearUrls();
  list.innerHTML = archived.slice().sort((a,b)=>b.archivedAt-a.archivedAt).map(a => `<button class="history-card" data-open-story="${a.id}" type="button"><span class="history-cover" data-cover="${a.id}">✦</span><span><small>${dateText(a.date)} · ${clean(a.location)}</small><h3>${clean(a.title)}</h3><p>${clean(summary(a))}</p></span></button>`).join('');
  for (const a of archived) { const target = $(`[data-cover="${a.id}"]`); const photo = await getMedia(a.coverId || a.records.photos?.[0]?.id); if (target && photo) target.innerHTML = `<img src="${blobUrl(photo)}" alt="${clean(a.location)}留下的照片">`; }
}
function summary(a) { return a.records.texts?.[0] || a.records.questions?.[0] || a.records.momNotes?.[0] || a.records.discoveries?.[0] || '这一天，留下了一段自己的故事。'; }
function newAdventure() {
  const location = $('#adventure-location').value.trim(); const age = $('#adventure-age').value.trim();
  if (!location) return toast('先写下今天要去的地方吧'); if (!selectedScene) return toast('选一个今天的场景吧');
  const customLines = $('#custom-clues').value.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,4);
  const title = ($('#custom-title').value.trim() || `${state.profile.name}的${location}冒险`).slice(0,28);
  const clues = mode === 'manual' ? customLines : templates(selectedScene,selectedInterest).slice(0,3);
  if (mode === 'manual' && clues.length < 2) return toast('写下两条轻轻的线索就好');
  const a = { id:id(), location, age:age || state.profile.age || '5', scene:selectedScene, interest:selectedInterest, title, date:Date.now(), clues, records:{photos:[],audios:[],texts:[],questions:[],momNotes:[],discoveries:[],firsts:[]}, archived:false };
  state.adventures.push(a); state.profile.age = a.age; save(); currentId = a.id; renderClues(); show('clues');
}
function renderClues() { const a = adventure(); if (!a) return show('home'); $('#clue-location-label').textContent = a.location; $('#clue-list').innerHTML = a.clues.map(c=>`<article class="clue">${clean(c)}</article>`).join(''); }
function renderRecord() { const a=adventure(); if (!a) return show('home'); $('#record-place').textContent=a.location; $('#photo-number').textContent=a.records.photos.length; $('#voice-number').textContent=a.records.audios.length+a.records.texts.length; $('#question-number').textContent=a.records.questions.length; $('#mother-number').textContent=a.records.momNotes.length; }
function openOverlay(kind) { const a=adventure(); if(!a)return; const content=$('#entry-content');
  if(kind==='photo') content.innerHTML=`<p class="eyebrow">想拍就拍，不拍也没关系</p><h2>拍下来</h2><p>这一张可以成为今天最值得留下的照片。</p><div class="media-buttons"><button class="media-button" id="take-photo" type="button">打开相机</button><button class="media-button" id="pick-photo" type="button">从相册选</button></div><input id="camera-file" accept="image/*" capture="environment" type="file" hidden><input id="gallery-file" accept="image/*" type="file" hidden><div class="preview-grid" id="photo-previews"></div>`;
  if(kind==='voice') content.innerHTML=`<p class="eyebrow">保留孩子原来怎么说</p><h2>今天你说了什么？</h2><p>可以录一小段声音，也可以由大人帮忙写下一句原话。</p><button class="record-button" id="record-voice" type="button">说给我听</button><p class="record-status" id="record-status"></p><label class="field-label">或者写下来<input id="child-text" maxlength="160" placeholder="比如：妈妈，那个云像一条鱼！"></label><button class="primary-button wide" id="save-child-text" type="button">留住这句话</button>`;
  if(kind==='question') content.innerHTML=`<p class="eyebrow">不用急着回答</p><h2>我有一个问题</h2><p>记下孩子真正好奇的那一句。</p><textarea id="entry-text" maxlength="160" placeholder="比如：为什么长颈鹿的脖子这么长？"></textarea><button class="primary-button wide" data-save-text="questions" type="button">把问题留下来</button>`;
  if(kind==='mother') content.innerHTML=`<p class="eyebrow">不是评语，只是你看到的她</p><h2>妈妈记一下</h2><p>一个犹豫、一个表情、一句让你记住的话，都可以。</p><textarea id="entry-text" maxlength="240" placeholder="比如：她看了好久才走近，后来自己伸手摸了摸。"></textarea><button class="primary-button wide" data-save-text="momNotes" type="button">把这一刻留下来</button>`;
  $('#entry-overlay').hidden=false;
  if(kind==='photo') { $('#take-photo').onclick=()=>$('#camera-file').click(); $('#pick-photo').onclick=()=>$('#gallery-file').click(); $('#camera-file').onchange=e=>savePhoto(e.target.files[0]); $('#gallery-file').onchange=e=>savePhoto(e.target.files[0]); renderPhotoPreviews(); }
  if(kind==='voice') bindVoiceSheet();
}
function closeOverlay(){ stopRecording(); $('#entry-overlay').hidden=true; clearUrls(); }
async function shrinkImage(file) { if(file.size <= 1.8*1024*1024)return file; const bitmap=await createImageBitmap(file); const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)); const canvas=document.createElement('canvas'); canvas.width=Math.round(bitmap.width*scale); canvas.height=Math.round(bitmap.height*scale); canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height); return await new Promise(r=>canvas.toBlob(b=>r(b),'image/jpeg',.8)); }
async function savePhoto(file) { if(!file)return; if(!file.type.startsWith('image/'))return toast('请选择一张照片'); try { const blob=await shrinkImage(file); const mediaId=id(); await putMedia({id:mediaId,blob}); adventure().records.photos.push({id:mediaId}); if(!adventure().coverId)adventure().coverId=mediaId; save(); renderPhotoPreviews(); renderRecord(); toast('这一刻收好了'); } catch { toast('照片没有保存成功，请再试一次'); } }
async function renderPhotoPreviews(){const a=adventure();const box=$('#photo-previews');if(!box)return;clearUrls();box.innerHTML='';for(const p of a.records.photos){const b=await getMedia(p.id);if(b)box.insertAdjacentHTML('beforeend',`<img src="${blobUrl(b)}" alt="已保存的照片">`)} }
function supportedMime(){return ['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(t=>window.MediaRecorder?.isTypeSupported?.(t));}
function bindVoiceSheet(){ const button=$('#record-voice'); button.onclick=()=> recorder?.state==='recording'?stopRecording():startRecording(); $('#save-child-text').onclick=()=>{const text=$('#child-text').value.trim();if(!text)return toast('先写下孩子的一句话吧');adventure().records.texts.push(text);save();renderRecord();closeOverlay();toast('原话留好了');}; }
async function startRecording(){if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){$('#record-status').textContent='这个浏览器暂时不能录音，可以先用文字留下原话。';return;}try{stream=await navigator.mediaDevices.getUserMedia({audio:true});chunks=[];const mime=supportedMime();recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onstop=async()=>{clearTimeout(timer);stream?.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'});try{const mediaId=id();await putMedia({id:mediaId,blob});adventure().records.audios.push({id:mediaId});save();renderRecord();if(!$('#entry-overlay').hidden){$('#record-voice').classList.remove('is-recording');$('#record-voice').textContent='重新录一段';$('#record-status').textContent='声音留好了，可以重新录。';}}catch{$('#record-status').textContent='声音没有保存成功，请再试一次。'}};recorder.start();$('#record-voice').classList.add('is-recording');$('#record-voice').textContent='正在听你说… 点一下结束';$('#record-status').textContent='最多 30 秒，想停就再点一下。';timer=setTimeout(stopRecording,30000);}catch{$('#record-status').textContent='没有获得麦克风权限，可以用文字留下原话。';}}
function stopRecording(){if(recorder?.state==='recording')recorder.stop();}
function saveEntry(key){const input=$('#entry-text');const text=input?.value.trim();if(!text)return toast('写下一句就好');adventure().records[key].push(text);save();renderRecord();closeOverlay();toast(key==='questions'?'这个好奇留下来了':'妈妈看到的这一刻留下来了');}
async function renderReview(){const a=adventure();if(!a)return show('home');clearUrls();$('#review-place-date').textContent=`${a.location} · ${dateText(a.date)}`;$('#discovery-input').value=a.records.discoveries[0]||'';$('#first-input').value=a.records.firsts[0]||'';const photos=$('#review-photos');photos.innerHTML='';for(const p of a.records.photos){const b=await getMedia(p.id);if(b)photos.insertAdjacentHTML('beforeend',`<div class="review-photo"><img src="${blobUrl(b)}" alt="今天留下的照片"><button class="delete-media" data-delete-photo="${p.id}" type="button">×</button></div>`)}$('#review-questions').innerHTML=renderTextLines(a.records.questions,'questions');$('#review-mother').innerHTML=renderTextLines(a.records.momNotes,'momNotes');await renderVoiceLines(a);}
function renderTextLines(lines,key){return lines.length?lines.map((line,i)=>`<div class="saved-line"><span>${clean(line)}</span><button class="remove-line" data-remove="${key}" data-index="${i}" type="button">×</button></div>`).join(''):'<p class="handbook-empty">还没有，留白也很好。</p>';}
async function renderVoiceLines(a){const box=$('#review-voices');let html=(a.records.texts||[]).map((x,i)=>`<div class="saved-line"><span>“${clean(x)}”</span><button class="remove-line" data-remove="texts" data-index="${i}" type="button">×</button></div>`).join('');for(let i=0;i<a.records.audios.length;i++){const b=await getMedia(a.records.audios[i].id);if(b)html+=`<div class="saved-line"><audio controls src="${blobUrl(b)}"></audio><button class="remove-line" data-remove="audios" data-index="${i}" type="button">×</button></div>`;}box.innerHTML=html||'<p class="handbook-empty">还没有，留白也很好。</p>';}
function archiveAndStory(){const a=adventure();a.records.discoveries=$('#discovery-input').value.trim()?[$('#discovery-input').value.trim()]:[];a.records.firsts=$('#first-input').value.trim()?[$('#first-input').value.trim()]:[];a.archived=true;a.archivedAt=Date.now();save();renderStory(a);show('story');}
async function renderStory(a){clearUrls();const photo=await getMedia(a.coverId||a.records.photos[0]?.id);const sections=[];if(a.records.discoveries.length)sections.push(['今天发现了什么',a.records.discoveries.map(clean).join('；')]);if(a.records.questions.length)sections.push(['最好奇的问题',a.records.questions.map(clean).join('；')]);if(a.records.texts.length)sections.push(['今天你说了什么',`“${clean(a.records.texts[0])}”`]);if(a.records.firsts.length)sections.push(['今天第一次尝试了什么',clean(a.records.firsts[0])]);if(a.records.momNotes.length)sections.push(['妈妈想记住',a.records.momNotes.map(clean).join('；')]);
  const audios=[];for(const item of a.records.audios){const b=await getMedia(item.id);if(b)audios.push(`<div class="story-audio"><span>声音</span><audio controls src="${blobUrl(b)}"></audio></div>`)}
  $('#story-sheet').innerHTML=`<p class="story-kicker">TODAY'S LITTLE ADVENTURE</p><h1>《${clean(a.title)}》</h1><p class="story-meta">${dateText(a.date)} · ${clean(a.location)} · ${clean(a.age)} 岁</p>${photo?`<div class="story-photo"><img src="${blobUrl(photo)}" alt="${clean(a.location)}的照片"><span>今天最值得留下的一张照片</span></div>`:'<div class="story-empty-photo">今天没有照片，但这段经历还在。</div>'}${sections.map(x=>`<section class="story-section"><h2>${x[0]}</h2><p>${x[1]}</p></section>`).join('')}${audios.length?`<section class="story-section"><h2>当时的声音</h2>${audios.join('')}</section>`:''}<footer class="story-footer"><span>我的童年冒险地图</span><b>+1</b><small>这一页，只来自今天真实发生的事。</small></footer>`;
}
function renderHandbook(){const archived=state.adventures.filter(a=>a.archived);const groups=[['我的好奇',archived.flatMap(a=>a.records.questions||[])],['我的发现',archived.flatMap(a=>a.records.discoveries||[])],['我的表达',archived.flatMap(a=>a.records.texts||[])],['我的第一次',archived.flatMap(a=>a.records.firsts||[])],['妈妈看到的我',archived.flatMap(a=>a.records.momNotes||[])]];$('#handbook-sections').innerHTML=groups.map(([name,items])=>`<section class="handbook-section"><h2>${name}</h2>${items.length?items.map(x=>`<p>“${clean(x)}”</p>`).join(''):'<p class="handbook-empty">以后慢慢会有的。</p>'}</section>`).join('');}
function openProfile(){const content=$('#entry-content');content.innerHTML=`<p class="eyebrow">这会出现在你的冒险手册上</p><h2>我是谁？</h2><label class="field-label">昵称<input id="profile-name-input" maxlength="12" value="${clean(state.profile.name)}"></label><label class="field-label">年龄<input id="profile-age-input" inputmode="numeric" type="number" min="1" max="12" value="${clean(state.profile.age)}"></label><button class="primary-button wide" id="save-profile" type="button">保存</button>`;$('#entry-overlay').hidden=false;$('#save-profile').onclick=()=>{state.profile.name=$('#profile-name-input').value.trim()||'小小探索家';state.profile.age=$('#profile-age-input').value.trim()||'5';save();closeOverlay();renderHome();};}

$('#start-adventure').onclick=()=>{selectedScene='';selectedInterest='';mode='auto';$('#adventure-location').value='';$('#adventure-age').value=state.profile.age;$('#custom-title').value='';$('#custom-clues').value='';$('#manual-fields').hidden=true;$$('.mode').forEach(x=>x.classList.toggle('is-selected',x.dataset.mode==='auto'));renderChoices();show('create');};
$('#edit-profile').onclick=openProfile;$('#open-handbook').onclick=()=>{renderHandbook();show('handbook');};
$('#scene-choices').onclick=e=>{const b=e.target.closest('[data-scene]');if(b){selectedScene=b.dataset.scene;renderChoices();}};$('#interest-choices').onclick=e=>{const b=e.target.closest('[data-interest]');if(b){selectedInterest=selectedInterest===b.dataset.interest?'':b.dataset.interest;renderChoices();}};
$$('.mode').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;$$('.mode').forEach(x=>x.classList.toggle('is-selected',x===b));$('#manual-fields').hidden=mode!=='manual';});
$('#make-clues').onclick=newAdventure;$('#go-record').onclick=()=>{renderRecord();show('record');};$('#edit-clues').onclick=()=>show('create');$('#open-review').onclick=()=>{renderReview();show('review');};
$$('[data-go]').forEach(b=>b.onclick=()=>{if(b.dataset.go==='home')renderHome();show(b.dataset.go);});
$('.record-actions').onclick=e=>{const b=e.target.closest('[data-record]');if(b)openOverlay(b.dataset.record);};
$('#entry-overlay').onclick=e=>{if(e.target.closest('[data-close-overlay]'))closeOverlay();const b=e.target.closest('[data-save-text]');if(b)saveEntry(b.dataset.saveText);};
$('#review-photos').onclick=async e=>{const b=e.target.closest('[data-delete-photo]');if(!b)return;const a=adventure();a.records.photos=a.records.photos.filter(p=>p.id!==b.dataset.deletePhoto);if(a.coverId===b.dataset.deletePhoto)a.coverId=a.records.photos[0]?.id;await deleteMedia(b.dataset.deletePhoto);save();renderReview();};
$('.review-page').onclick=async e=>{const b=e.target.closest('[data-remove]');if(!b)return;const a=adventure();const key=b.dataset.remove;const index=Number(b.dataset.index);const removed=a.records[key].splice(index,1)[0];if(key==='audios'&&removed?.id)await deleteMedia(removed.id);save();renderReview();};
$('#make-story').onclick=archiveAndStory;$('#history-list').onclick=e=>{const b=e.target.closest('[data-open-story]');if(!b)return;currentId=b.dataset.openStory;renderStory(adventure());show('story');};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#entry-overlay').hidden)closeOverlay();});window.addEventListener('beforeunload',()=>stream?.getTracks().forEach(t=>t.stop()));
renderHome();
