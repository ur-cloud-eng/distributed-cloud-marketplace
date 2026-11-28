async function api(path, method='GET', body) {
    const options = {method,headers:{Accept:'application/json'},credentials:'same-origin',cache:'no-store'};
    if (method !== 'GET') {
        options.headers['Content-Type']='application/json';
        options.body=JSON.stringify(body || {});
    }
    const response=await fetch(path,options);
    const data=await response.json().catch(()=>({error:'Unexpected server response.'}));
    if(!response.ok) throw new Error(data.error || data.message || 'Request failed.');
    return data;
}
const label = value => value.replace(/_/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,x=>x.toUpperCase());
function el(tag,text) { const node=document.createElement(tag); if(text!==undefined) node.textContent=text; return node; }
function format(value) { return value===null || value===undefined ? '—' : typeof value==='object' ? JSON.stringify(value) : String(value); }
function render(target,data,fields=[]) {
    target.replaceChildren();
    if(Array.isArray(data)) {
        if(!data.length) {target.textContent='No records found.'; return;}
        if(data.some(row=>!row || typeof row!=='object')) {const list=el('ul');data.forEach(x=>list.append(el('li',format(x))));target.append(list);return;}
        const keys=fields.length?fields:[...new Set(data.flatMap(row=>Object.keys(row)))];
        const region=el('div');
        region.className='table-scroll';
        region.tabIndex=0;
        region.setAttribute('role','region');
        region.setAttribute('aria-label','Results table');
        const table=el('table'), head=el('thead'), header=el('tr'), body=el('tbody');
        keys.forEach(key=>header.append(el('th',label(key))));head.append(header);table.append(head,body);
        for(const row of data) {const tr=el('tr');keys.forEach(key=>tr.append(el('td',key==='is_read' ? (row[key] ? 'Read' : 'Unread') : format(row[key]))));body.append(tr);}region.append(table);target.append(region);return;
    }
    if(data && typeof data==='object') {
        const dl=el('dl');
        for(const [key,value] of Object.entries(data)) {
            if(value!==null && typeof value==='object') {const section=el('div');section.append(el('h3',label(key)));const child=el('div');render(child,value);section.append(child);target.append(section);}
            else if(key==='qrCode' && typeof value==='string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value)) {const image=el('img');image.src=value;image.alt='Authenticator setup QR code';target.append(image);}
            else {const item=el('div');item.append(el('dt',label(key)),el('dd',format(value)));dl.append(item);}
        }
        if(dl.children.length) target.prepend(dl);
        if(!target.children.length)target.textContent='No information available.';
    } else target.textContent=format(data);
}
function showError(target,error){target.classList.add('live-error');target.textContent=error.message;}
async function refresh(){await Promise.all([...document.querySelectorAll('[data-source]')].map(async target=>{
    target.classList.remove('live-error');target.textContent='Loading…';
    try {const data=await api(target.dataset.source);render(target,target.dataset.key?data[target.dataset.key]:data,JSON.parse(target.dataset.fields));}catch(error){showError(target,error);}
}));}
function collect(form){
    const data=JSON.parse(form.dataset.fixed);
    for(const [key,value] of new FormData(form)) {
        if(value==='')continue;
        const field=form.elements.namedItem(key);
        if(field.type==='number')data[key]=Number(value);
        else data[key]=value;
    }
    if('confirmPassword' in data){if(data.password!==data.confirmPassword)throw new Error('Passwords do not match.');delete data.confirmPassword;}
    const path=form.dataset.path.replace(/:([A-Za-z]+)/g,(_,key)=>{const value=data[key];if(!Number.isSafeInteger(value)||value<1)throw new Error(label(key)+' must be a positive integer.');delete data[key];return encodeURIComponent(value);});
    return {path,data};
}
for(const form of document.querySelectorAll('.live-form')){
    form.addEventListener('submit',async event=>{
        event.preventDefault();const output=form.querySelector('.form-result'),button=form.querySelector('button[type=submit]');output.classList.remove('live-error');
        try {
            const {path,data}=collect(form);const method=form.dataset.method;
            if((method==='DELETE'||/\/cancel$|\/payments$|\/usage-invoices$/.test(path)&&method!=='GET'&&data.dry_run!==true)&&!window.confirm('Confirm this operation?'))return;
            button.disabled=true;output.textContent='Processing…';const result=await api(path,method,data);
            if(path==='/api/auth/login'||path==='/api/auth/login/2fa'){location.assign(result.requires2FA?'/two-factor':'/portal');return;}
            render(output,result);
            if(path==='/api/auth/register'||path==='/api/auth/verify-email'){const link=el('a','Go to sign in');link.href='/login';output.append(link);}
            if(method!=='GET')await refresh();
        }catch(error){showError(output,error);}finally{button.disabled=false;}
    });
}
const token=document.querySelector('input[name=token]');if(token){const value=new URLSearchParams(location.search).get('token');if(value){token.value=value;history.replaceState(null,'',location.pathname);}}
document.querySelector('#refresh')?.addEventListener('click',refresh);
document.querySelector('#logout')?.addEventListener('click',async()=>{try{await api('/api/auth/logout','POST');location.assign('/login');}catch(error){alert(error.message);}});
refresh();
