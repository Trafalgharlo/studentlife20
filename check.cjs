const assert = require('node:assert/strict');
require('./preview.cjs');
const { chromium } = require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_CHANNEL ? {channel:process.env.TEST_BROWSER_CHANNEL} : {})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://telegram.org/**',r=>r.fulfill({body:''}));
 await page.goto('http://127.0.0.1:4175');
 await page.screenshot({path:'desktop-preview.png',fullPage:true});
 assert.equal(await page.locator('.module').count(),6);
 const samples={schedule:{title:'Тестовая пара',start:'15:00',end:'16:00',room:'101',teacher:'Тест'},reminders:{title:'Тестовая задача',time:'17:00',note:'Заметка'},dorm:{title:'Тестовое дело',friend:'Друг',note:'Детали'},meals:{title:'Тестовое блюдо',minutes:'15',ingredients:'Рис',recipe:'Сварить'},gym:{title:'Тестовое упражнение',sets:'3',reps:'10',note:'Заметка'},finance:{title:'Тестовая операция',amount:'1234.50',category:'Тест'}};
 for(const [key,values] of Object.entries(samples)) {
  await page.locator(`#navigation a[href="#${key}"]`).click();
  const before=await page.locator('.row').count();
  await page.locator('[data-add]').click();
  for(const [name,value] of Object.entries(values)) await page.locator(`[name="${name}"]`).fill(value);
  if(key==='schedule') { await page.locator('[name="end"]').fill('14:00'); await page.locator('[type="submit"]').click(); assert.match(await page.locator('#form-error').innerText(),/позже/); await page.locator('[name="end"]').fill('16:00'); }
  await page.locator('[type="submit"]').click();
  assert.equal(await page.locator('.row').count(),before+1);
  let row=page.locator('.row').filter({has:page.getByRole('heading',{name:values.title,exact:true})});
  assert.equal(await row.locator('.badge').count(),0);
  await row.locator('[data-edit]').click();
  await page.locator('[name="title"]').fill(values.title+' изменено');
  await page.locator('[type="submit"]').click();
  await page.reload();
  row=page.locator('.row').filter({has:page.getByRole('heading',{name:values.title+' изменено',exact:true})});
  assert.equal(await row.count(),1);
  if(['reminders','dorm','gym'].includes(key)){await row.locator('input').check();await page.reload();assert.equal(await row.locator('input').isChecked(),true);}
  await row.locator('[data-delete]').click(); await page.locator('#cancel-delete').click(); assert.equal(await row.count(),1);
  await row.locator('[data-delete]').click(); await page.locator('#confirm-delete').click(); assert.equal(await page.locator('.row').count(),before);
  console.log('PASS CRUD + persistence: '+key);
 }
 await page.goto('http://127.0.0.1:4175/#meals');
 await page.locator('[data-random]').click(); const meal=await page.locator('.random h2').innerText(); await page.locator('[data-random]').click(); assert.notEqual(await page.locator('.random h2').innerText(),meal);
 await page.goto('http://127.0.0.1:4175/#reminders');await page.locator('[data-add]').click();await page.locator('[name="title"]').fill('<img src=x onerror=alert(1)>');await page.locator('[name="time"]').fill('18:00');await page.locator('[type="submit"]').click();assert.equal(await page.locator('.row img').count(),0);
 await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:4175/#home');await page.evaluate(()=>document.querySelector('#status').textContent='');await page.screenshot({path:'mobile-preview.png',fullPage:true});
 for(const key of ['home',...Object.keys(samples)]) {await page.goto('http://127.0.0.1:4175/#'+key);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'overflow '+key);}
 await page.setViewportSize({width:320,height:700});await page.reload();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.evaluate(()=>localStorage.setItem('student-life:v1','{broken'));await page.reload();assert.equal(await page.locator('.row').count(),3);
 await page.emulateMedia({colorScheme:'dark'});await page.goto('http://127.0.0.1:4175/#home');assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 assert.deepEqual(errors,[]);
 const telegram=await browser.newPage();
 await telegram.route('https://telegram.org/**',r=>r.fulfill({body:''}));
 await telegram.addInitScript(()=>{
  window.calls=[]; window.events={};
  window.Telegram={WebApp:{colorScheme:'dark',contentSafeAreaInset:{top:10,bottom:5},safeAreaInset:{top:20,bottom:10},ready(){calls.push('ready')},expand(){calls.push('expand')},onEvent(name,cb){events[name]=cb},BackButton:{onClick(cb){window.back=cb},show(){calls.push('show')},hide(){calls.push('hide')}}}};
 });
 await telegram.goto('http://127.0.0.1:4175');assert.deepEqual(await telegram.evaluate(()=>calls.slice(0,2)),['ready','expand']);
 await telegram.locator('a[href="#schedule"]').first().click();await telegram.locator('[data-add]').click();await telegram.evaluate(()=>back());assert.equal(await telegram.locator('#editor').evaluate(d=>d.open),false);
 await telegram.evaluate(()=>back());await telegram.waitForURL('**/#home');
 await telegram.evaluate(()=>{Telegram.WebApp.colorScheme='light';events.themeChanged()});assert.equal(await telegram.locator('html').getAttribute('data-theme'),'light');
 assert.equal(await telegram.evaluate(()=>document.documentElement.style.getPropertyValue('--safe-top')),'30px');
 console.log('PASS Telegram ready/expand, BackButton, live theme and safe area integration (mock SDK)');
 console.log('PASS randomizer, XSS escaping, 320/390px layouts, corrupt storage, dark theme, no browser errors');
 await browser.close();
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
