'use strict';
(() => {
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const days = ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
  const dayIndex = () => (new Date().getDay() + 6) % 7;
  const modules = {
    schedule: {title:'Расписание пар',icon:'📚',desc:'Учёба без сюрпризов. Всё по плану.',color:'#eee9ff'},
    reminders: {title:'Напоминания',icon:'🔔',desc:'Освободи голову для чего-то классного.',color:'#fff1d8'},
    dorm: {title:'Общага с друзьями',icon:'🏡',desc:'Делим быт, собираем воспоминания.',color:'#e5f4ed'},
    meals: {title:'Что приготовить?',icon:'🍳',desc:'Вкусные идеи, когда идей совсем нет.',color:'#ffede5'},
    gym: {title:'Качалка',icon:'🏋️',desc:'Твой прогресс начинается с первого подхода.',color:'#e8efff'},
    finance: {title:'Финансы',icon:'💸',desc:'Держи бюджет под контролем.',color:'#fce8f1'}
  };
  const fields = {
    schedule:[['title','Предмет','text'],['day','День недели',days],['start','Начало','time'],['end','Конец','time'],['room','Аудитория','text'],['teacher','Преподаватель','text']],
    reminders:[['title','Что нужно сделать?','text'],['date','Дата','date'],['time','Время','time'],['note','Заметка','textarea']],
    dorm:[['title','Общее дело','text'],['friend','Кто отвечает?','text'],['date','Дата','date'],['note','Детали','textarea']],
    meals:[['title','Название блюда','text'],['minutes','Время приготовления, мин','number'],['ingredients','Ингредиенты','textarea'],['recipe','Как приготовить','textarea']],
    gym:[['title','Тренировка / упражнение','text'],['date','Дата','date'],['sets','Подходы','number'],['reps','Повторения','number'],['note','Заметка','textarea']],
    finance:[['title','Описание операции','text'],['kind','Тип',['Расход','Доход']],['amount','Сумма, ₸','number'],['date','Дата','date'],['category','Категория','text']]
  };
  const seed = {
    schedule:[{title:'Высшая математика',day:days[dayIndex()],start:'09:00',end:'10:30',room:'Корпус А · 304',teacher:'Иванова А. С.'},{title:'Английский язык',day:days[dayIndex()],start:'10:45',end:'12:15',room:'Корпус Б · 212',teacher:'Смирнова Е. В.'},{title:'Программирование',day:days[(dayIndex()+1)%7],start:'13:00',end:'14:30',room:'Лаборатория 105',teacher:'Петров Д. И.'}],
    reminders:[{title:'Сдать лабораторную работу',date:today(),time:'18:00',note:'Проверить выводы и прикрепить отчёт.'},{title:'Забрать книги в библиотеке',date:today(),time:'16:00',note:'Не забудь студенческий билет.'}],
    dorm:[{title:'Купить продукты на ужин',friend:'Аня',date:today(),note:'Макароны, томаты, сыр.'},{title:'Уборка общей кухни',friend:'Саша',date:today(),note:'Вместе справимся быстрее.'}],
    meals:[{title:'Паста с томатами',minutes:20,ingredients:'Макароны, томаты, чеснок, сыр',recipe:'Отвари макароны. Обжарь чеснок и томаты. Соедини с пастой и посыпь сыром.'},{title:'Омлет с овощами',minutes:10,ingredients:'Яйца, молоко, перец, помидор',recipe:'Нарежь и обжарь овощи. Взбей яйца с молоком, залей овощи и готовь под крышкой.'},{title:'Гречка с грибами',minutes:25,ingredients:'Гречка, грибы, лук',recipe:'Отвари гречку. Обжарь лук и грибы, смешай и приправь по вкусу.'}],
    gym:[{title:'Приседания',date:today(),sets:3,reps:12,note:'Разминка перед тренировкой.'}],
    finance:[{title:'Стипендия',kind:'Доход',amount:47000,date:today(),category:'Учёба'},{title:'Продукты на неделю',kind:'Расход',amount:8500,date:today(),category:'Продукты'},{title:'Проездной',kind:'Расход',amount:3000,date:today(),category:'Транспорт'}]
  };
  for (const [key,items] of Object.entries(seed)) items.forEach((item,i) => Object.assign(item,{id:`demo-${key}-${i}`,demo:true,done:false}));
  const storageKey = 'student-life:v1';
  let data = structuredClone(seed), selectedDay = days[dayIndex()], selectedMeal = null, editing = null, deleting = null, toastTimer;
  function toast(message) { $('#status').textContent = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#status').textContent = '',4500); }
  function validStore(value) {
    return value && Object.keys(modules).every(key => Array.isArray(value[key]) && value[key].every(item => item && typeof item.id === 'string' && typeof item.title === 'string' && fields[key].every(([name,,type]) => type === 'number' ? Number.isFinite(item[name]) && item[name]>0 : typeof item[name] === 'string')));
  }
  try { const raw = localStorage.getItem(storageKey); if(raw) { const saved = JSON.parse(raw); if (!validStore(saved)) throw new Error('Invalid storage'); data = saved; } }
  catch { toast('Сохранённые данные недоступны. Открыты демонстрационные примеры.'); }
  function persist() { try { localStorage.setItem(storageKey,JSON.stringify(data)); return true; } catch { toast('Не удалось сохранить в браузере. Изменения доступны до закрытия страницы.'); return false; } }
  const tg = window.Telegram?.WebApp;
  function theme() {
    document.documentElement.dataset.theme = tg?.colorScheme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark':'light');
    const inset = tg?.contentSafeAreaInset, safe = tg?.safeAreaInset;
    document.documentElement.style.setProperty('--safe-top',`${(inset?.top||0)+(safe?.top||0)}px`);
    document.documentElement.style.setProperty('--safe-bottom',`${(inset?.bottom||0)+(safe?.bottom||0)}px`);
  }
  theme();
  if(tg) { tg.ready(); tg.expand(); tg.onEvent?.('themeChanged',theme); tg.onEvent?.('safeAreaChanged',theme); tg.onEvent?.('contentSafeAreaChanged',theme); tg.BackButton?.onClick(() => { if($('#editor').open) $('#editor').close(); else if($('#confirm').open) $('#confirm').close(); else location.hash='home'; }); }
  else matchMedia('(prefers-color-scheme: dark)').addEventListener('change',theme);
  function route() { const key = location.hash.slice(1); return Object.hasOwn(modules,key)?key:'home'; }
  function syncBack() { if (!tg?.BackButton) return; if(route()!=='home'||$('#editor').open||$('#confirm').open) tg.BackButton.show(); else tg.BackButton.hide(); }
  function badge(item) { return item.demo?'<span class="badge">Демо</span>':''; }
  function stat(icon,value,label) { return `<div class="stat"><span class="icon-tile">${icon}</span><div><strong>${escape(value)}</strong><small>${label}</small></div></div>`; }
  const money = amount => new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(amount)+' ₸';
  function empty(text) { return `<div class="empty"><span>☁</span><p>${text}</p></div>`; }
  function row(key,item) {
    let detail='';
    if(key==='schedule') detail=`${item.start}–${item.end} · ${item.room}\n${item.teacher}`;
    if(key==='reminders') detail=`${item.date} · ${item.time}${item.note?'\n'+item.note:''}`;
    if(key==='dorm') detail=`${item.friend} · ${item.date}${item.note?'\n'+item.note:''}`;
    if(key==='meals') detail=`${item.minutes} мин · ${item.ingredients}\n${item.recipe}`;
    if(key==='gym') detail=`${item.date} · ${item.sets} × ${item.reps}${item.note?'\n'+item.note:''}`;
    if(key==='finance') detail=`${item.date} · ${item.category}`;
    const canCheck = ['reminders','dorm','gym'].includes(key);
    return `<article class="row ${item.done?'done':''}">${canCheck?`<input class="check" type="checkbox" data-toggle="${escape(item.id)}" ${item.done?'checked':''} aria-label="Выполнено: ${escape(item.title)}">`:`<span class="icon-tile" aria-hidden="true">${modules[key].icon}</span>`}<div class="row-body"><h3>${escape(item.title)}${badge(item)}</h3><p>${escape(detail)}</p>${key==='finance'?`<strong class="${item.kind==='Доход'?'money-positive':'money-negative'}">${item.kind==='Доход'?'+':'−'}${money(item.amount)}</strong>`:''}</div><div class="actions"><button class="icon-button" data-edit="${escape(item.id)}" aria-label="Редактировать: ${escape(item.title)}">✎</button><button class="icon-button" data-delete="${escape(item.id)}" aria-label="Удалить: ${escape(item.title)}">×</button></div></article>`;
  }
  function home() {
    const classes = data.schedule.filter(x=>x.day===days[dayIndex()]).length;
    const tasks = data.reminders.filter(x=>x.date===today()&&!x.done).length;
    const workouts = data.gym.filter(x=>x.date===today()&&!x.done).length;
    return `<section class="hero"><span class="eyebrow">ЖИЗНЬ — ЭТО БОЛЬШЕ, ЧЕМ ПАРЫ</span><h2>Планы в порядке.<br>Ты — в моменте.</h2><p>Учись, встречайся с друзьями и находи время для себя. Остальное соберём здесь.</p><a class="primary" href="#schedule">Моё расписание →</a><span class="hero-art" aria-hidden="true">🎒</span></section><div class="section-head"><h2>Твой день в цифрах</h2><small>Включая демонстрационные записи</small></div><div class="stats">${stat('📚',classes,'Пар сегодня')}${stat('☑',tasks,'Дел на сегодня')}${stat('⚡',workouts,'Упражнений в плане')}</div><div class="section-head"><h2>Всё, что тебе нужно</h2><small>Шесть разделов. Один ритм.</small></div><div class="cards">${Object.entries(modules).map(([key,m])=>`<a class="module" href="#${key}"><div class="module-top"><span class="icon-tile" style="--tile:${m.color}">${m.icon}</span><span class="arrow">↗</span></div><h3>${m.title}</h3><p>${m.desc}</p><div class="module-meta">${data[key].length} записей · открыть →</div></a>`).join('')}</div>`;
  }
  function mealPanel() {
    const chosen = data.meals.find(x=>x.id===selectedMeal);
    return `<section class="random"><span aria-hidden="true">🍲</span><h2>${chosen?escape(chosen.title)+badge(chosen):'Что сегодня на тарелке?'}</h2><p>${chosen?escape(`${chosen.minutes} минут\n${chosen.ingredients}\n${chosen.recipe}`):'Выбери случайное блюдо из своего списка.'}</p><button class="primary" data-random ${data.meals.length?'':'disabled'}>↻ ${chosen?'Ещё вариант':'Выбрать блюдо'}</button></section>`;
  }
  function render() {
    const key = route();
    $('#navigation').innerHTML = [['home',{title:'Мой день',icon:'◈'}],...Object.entries(modules)].map(([id,m])=>`<a href="#${id}" class="nav-link ${key===id?'active':''}" ${key===id?'aria-current="page"':''}><span class="nav-icon" aria-hidden="true">${m.icon}</span>${m.title}</a>`).join('');
    $('#heading').textContent=key==='home'?'Привет! Как твой день?':modules[key].title;
    $('#subtitle').textContent=key==='home'?'Твой маленький помощник для большой студенческой жизни.':modules[key].desc;
    $('#date').textContent=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',weekday:'short'}).format(new Date());
    if(key==='home') $('#view').innerHTML=home();
    else {
      let extra='', items=[...data[key]];
      if(key==='schedule') { extra=`<div class="tabs" role="group" aria-label="День недели">${days.map(day=>`<button class="tab ${day===selectedDay?'active':''}" data-day="${day}" aria-pressed="${day===selectedDay}">${day.slice(0,2)}</button>`).join('')}</div>`; items=items.filter(x=>x.day===selectedDay).sort((a,b)=>a.start.localeCompare(b.start)); }
      if(key==='finance') { const total=kind=>data.finance.filter(x=>x.kind===kind).reduce((sum,x)=>sum+x.amount,0); extra=`<div class="stats">${stat('↗',money(total('Доход')),'Все доходы')}${stat('↘',money(total('Расход')),'Все расходы')}${stat('◈',money(total('Доход')-total('Расход')),'Баланс · включая демо')}</div>`; }
      if(key==='meals') extra=mealPanel();
      if(['reminders','dorm','gym','finance'].includes(key)) items.sort((a,b)=>Number(a.done||false)-Number(b.done||false)||a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||''));
      $('#view').innerHTML=extra+`<div class="section-head"><h2>${key==='schedule'?selectedDay:key==='meals'?'Мои блюда':'Мои записи'} <span class="badge">${items.length}</span></h2><button class="primary" data-add="${key}">＋ Добавить</button></div><div class="rows">${items.length?items.map(x=>row(key,x)).join(''):empty('Здесь пока пусто. Добавь первую запись.')}</div>`;
    }
    syncBack();
  }
  function openEditor(key,id) {
    const item = data[key].find(x=>x.id===id);
    editing={key,id};
    $('#editor-title').textContent=item?'Редактировать запись':'Новая запись';
    $('#form-error').textContent='';
    $('#fields').innerHTML=fields[key].map(([name,label,type])=>{
      const value=item?.[name]??(name==='date'?today():name==='day'?selectedDay:'');
      let control;
      if(Array.isArray(type)) control=`<select name="${name}">${type.map(option=>`<option ${option===value?'selected':''}>${escape(option)}</option>`).join('')}</select>`;
      else if(type==='textarea') control=`<textarea name="${name}" maxlength="2000" ${['ingredients','recipe'].includes(name)?'required':''}>${escape(value)}</textarea>`;
      else control=`<input name="${name}" type="${type}" value="${escape(value)}" ${name==='teacher'?'':'required'} ${type==='number'?`min="${name==='amount'?'0.01':'1'}" max="${name==='amount'?'1000000000':'10000'}" step="${name==='amount'?'0.01':'1'}"`:'maxlength="150"'}>`;
      return `<label class="field">${label}${control}</label>`;
    }).join('');
    $('#editor').showModal(); syncBack();
  }
  $('#edit-form').addEventListener('submit',event=>{
    event.preventDefault();
    const {key,id}=editing, values=Object.fromEntries(new FormData(event.target));
    for(const [name,,type] of fields[key]) { if(type==='number') values[name]=Number(values[name]); else values[name]=values[name].trim(); }
    if(!values.title || fields[key].some(([name,,type])=>type!=='textarea'&&name!=='teacher'&&!values[name]) || (key==='meals'&&(!values.ingredients||!values.recipe))) { $('#form-error').textContent='Заполни обязательные поля. Пробелы не считаются текстом.'; return; }
    if(key==='schedule'&&values.end<=values.start) { $('#form-error').textContent='Конец пары должен быть позже начала.'; return; }
    const old=data[key].find(x=>x.id===id);
    const item={...old,...values,id:old?.id||crypto.randomUUID(),demo:old?.demo||false,done:old?.done||false};
    if(old) data[key]=data[key].map(x=>x.id===id?item:x); else data[key].push(item);
    if(key==='schedule') selectedDay=values.day;
    const saved=persist(); $('#editor').close(); render(); if(saved) toast('Запись сохранена в этом браузере.');
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest('button'); if(!button) return;
    const key=route();
    if(button.hasAttribute('data-close')) $('#editor').close();
    if(button.dataset.add) openEditor(button.dataset.add);
    if(button.dataset.edit) openEditor(key,button.dataset.edit);
    if(button.dataset.day) { selectedDay=button.dataset.day; render(); }
    if(button.dataset.delete) { deleting={key,id:button.dataset.delete}; $('#confirm').showModal(); syncBack(); }
    if(button.hasAttribute('data-random')) { const pool=data.meals.filter(x=>data.meals.length===1||x.id!==selectedMeal); if(pool.length) { selectedMeal=pool[Math.floor(Math.random()*pool.length)].id; render(); } }
  });
  document.addEventListener('change',event=>{
    if(!event.target.dataset.toggle) return;
    const item=data[route()].find(x=>x.id===event.target.dataset.toggle); if(!item) return;
    item.done=event.target.checked; persist(); render();
  });
  $('#cancel-delete').onclick=()=>$('#confirm').close();
  $('#confirm-delete').onclick=()=>{ if(!deleting) return; data[deleting.key]=data[deleting.key].filter(x=>x.id!==deleting.id); const saved=persist(); $('#confirm').close(); deleting=null; render(); if(saved) toast('Запись удалена.'); };
  for(const dialog of [$('#editor'),$('#confirm')]) dialog.addEventListener('close',syncBack);
  window.addEventListener('hashchange',()=>{ if($('#editor').open) $('#editor').close(); if($('#confirm').open) $('#confirm').close(); render(); $('#content').focus({preventScroll:true}); });
  render();
})();
