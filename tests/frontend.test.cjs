const test=require('node:test');
const assert=require('node:assert/strict');
const {auth,portal}=require('../frontend/livePages');
const swagger=require('../backend/swagger');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const config=[...Object.values(auth),...Object.values(portal).flatMap(role=>Object.values(role).flatMap(page=>[...page.forms,...page.tables.map(t=>({...t,method:'GET'}))]))];
function routeMatches(pattern,actual){
 const segments=actual.split('/');
 const expected=pattern.split('/');
 return expected.length===segments.length&&expected.every((segment,i)=>segment.startsWith('{')||segment===segments[i]);
}
test('Every live API action has a documented method and route',()=>{
 for(const item of config){
  const url=new URL(item.path,'http://localhost');
  const operation=Object.entries(swagger.paths).find(([route,methods])=>
   routeMatches(route,url.pathname)&&methods[item.method.toLowerCase()])?.[1][item.method.toLowerCase()];
  assert.ok(operation,`${item.method} ${item.path}`);
  for(const key of url.searchParams.keys())
   assert.ok(operation.parameters.some(p=>p.in==='query'&&p.name===key),key);
 }
});
test('All path variables have numeric fields',()=>{
 for(const item of config) for(const match of item.path.matchAll(/:([A-Za-z]+)/g)) assert.ok(item.fields.some(f=>f.name===match[1]&&f.type==='number'),item.path);
});
test('Customer resource creation supports all eleven types',()=>{
 const creation=portal.customer.resources.forms.filter(f=>f.category==='create');assert.equal(creation.length,11);assert.equal(new Set(creation.map(f=>f.title)).size,11);
});
test('Registration uses lowercase roles and no admin choice',()=>assert.deepEqual(auth.register.fields.find(f=>f.name==='role').options,['customer','provider']));
test('Form data conversion uses numeric IDs and capacities, omits empty optional inputs and preserves TOTP strings',()=>{
 const script=fs.readFileSync(path.join(__dirname,'../frontend/public/js/live.js'),'utf8');
 const context=vm.createContext({document:{querySelectorAll:()=>[],querySelector:()=>null},FormData:class{constructor(form){this.values=form.values;}*[Symbol.iterator](){yield* this.values;}}});
 vm.runInContext(script,context);
 const input={dataset:{fixed:'{"engine":"MYSQL"}',path:'/api/resource-groups/:groupId/databases'},values:[['groupId','4'],['vcpu','2'],['code','012345'],['note','']],elements:{namedItem:key=>({type:['groupId','vcpu'].includes(key)?'number':'text'})}};
 const result=context.collect(input);assert.equal(result.path,'/api/resource-groups/4/databases');assert.deepEqual(JSON.parse(JSON.stringify(result.data)),{engine:'MYSQL',vcpu:2,code:'012345'});
});
test('Wrong confirmation and invalid URL IDs are rejected',()=>{
 const script=fs.readFileSync(path.join(__dirname,'../frontend/public/js/live.js'),'utf8');
 const context=vm.createContext({document:{querySelectorAll:()=>[],querySelector:()=>null},FormData:class{constructor(form){this.values=form.values;}*[Symbol.iterator](){yield* this.values;}}});vm.runInContext(script,context);
 assert.throws(()=>context.collect({dataset:{fixed:'{}',path:'/api/auth/register'},values:[['password','abc'],['confirmPassword','xyz']],elements:{namedItem:()=>({type:'password'})}}),/Passwords do not match/);
 assert.throws(()=>context.collect({dataset:{fixed:'{}',path:'/api/instances/:id'},values:[['id','0']],elements:{namedItem:()=>({type:'number'})}}),/positive integer/);
});


test('Financial, resource and notification forms use the simplified API fields',()=>{
 const payment=portal.customer.billing.forms.find(form=>form.title==='Pay invoice');
 assert.deepEqual(payment.fields.map(field=>field.name),['invoice_id']);
 const usage=portal.admin.finance.forms.filter(form=>form.path.endsWith('/usage-invoices'));
 assert.deepEqual(usage.map(form=>form.fixed.dry_run),[true,false]);
 for(const form of usage)
  assert.deepEqual(form.fields.map(field=>field.name),['customer_id','billing_period_start','billing_period_end']);
 const loadBalancer=portal.customer.resources.forms.find(form=>form.title==='Load balancer');
 assert.deepEqual(loadBalancer.fields.map(field=>field.name),['groupId','vnetId','name','hostingClass','vcpu','ramGb','diskGb','algorithm']);
 assert.ok(portal.customer.notifications.tables.some(table=>table.path==='/api/notifications?unread_only=true'));
 for(const item of config) assert.doesNotMatch(item.path,/\/(?:refunds|withdrawals|discounts|history|audit-log|restart|ip|targets|activity)(?:\/|$)/);
});

test('Live EJS views render their forms and reference existing static assets',async()=>{
 const ejs=require('ejs');
 const frontend=path.join(__dirname,'../frontend');
 const render=(view,locals)=>ejs.renderFile(path.join(frontend,'views/live',view+'.ejs'),locals);
 const {resourceTypes}=require('../frontend/livePages');
 const services=await render('public',{title:'Services',url:'/services',resourceTypes});
 for(const {label} of resourceTypes) assert.ok(services.includes(label),label);
 for(const [,asset] of services.matchAll(/(?:href|src)="\/assets\/([^"]+)"/g))
  assert.ok(fs.existsSync(path.join(frontend,'public',asset)),asset);
 for(const [key,form] of Object.entries(auth)){
  const html=await render('auth',{title:form.title,key,config:form});
  assert.ok(html.includes(`data-path="${form.path}"`));
 }
 for(const [role,pages] of Object.entries(portal)){
  for(const [key,config] of Object.entries(pages)){
   const base='/portal/'+role;
   const html=await render('portal',{title:config.title,key,config,role,base,navigation:[],currentPath:base});
   for(const form of config.forms) assert.ok(html.includes(`data-path="${form.path}"`),form.path);
   for(const [,link] of config.links) assert.ok(Object.hasOwn(pages,link.slice(1)),link);
  }
 }
});
