const test=require('node:test');
const assert=require('node:assert/strict');
const {auth,portal}=require('../frontend/livePages');
const swagger=require('../backend/swagger');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const config=[...Object.values(auth),...Object.values(portal).flatMap(role=>Object.values(role).flatMap(page=>[...page.forms,...page.tables.map(t=>({...t,method:'GET'}))]))];
function routeMatches(pattern,actual){return pattern.split('/').length===actual.split('/').length&&pattern.split('/').every((part,i)=>part.startsWith('{')||actual.split('/')[i].startsWith(':')||part===actual.split('/')[i]);}
test('Every live API action has a documented method and route',()=>{
 for(const item of config){assert.ok(Object.entries(swagger.paths).some(([route,methods])=>routeMatches(route,item.path)&&methods[item.method.toLowerCase()]),`${item.method} ${item.path}`);}
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
