const resourceTypes = [
  ['Resource Group', 'Organization', "Container for one environment's resources."],
  ['Virtual Network', 'Networking', 'Private address space for your resources.'],
  ['Subnet', 'Networking', 'Address range inside a virtual network.'],
  ['Load Balancer', 'Networking', 'Simulated load balancer associated with a virtual network.'],
  ['Virtual Machine', 'Compute', 'Simulated server with vCPU, RAM and disk.'],
  ['Blob Storage', 'Storage', 'Unstructured objects such as images and backups.'],
  ['File Storage', 'Storage', 'Shared file system for folders and documents.'],
  ['Managed SQL Server', 'Databases', 'Simulated Microsoft SQL Server database.'],
  ['Managed PostgreSQL', 'Databases', 'Simulated PostgreSQL database.'],
  ['Managed MySQL', 'Databases', 'Simulated MySQL database.'],
  ['Web App', 'Applications', 'Simulated hosted web application.']
].map(([label, category, description]) => ({ label, category, description }));
const field = (name,label,type='text',options=null,optional=false) => ({name,label,type,options,optional});
const n = (name,label,optional=false) => field(name,label,'number',null,optional);
const s = (name,label,options,optional=false) => field(name,label,'select',options,optional);
const t = (name,label,optional=false) => field(name,label,'text',null,optional);
const classes = ['Economy','Business','Critical'];
const kinds = ['CPU','RAM','Storage','GPU'];
const cls = s('hostingClass','Hosting class',classes);
const capacity = [cls,n('vcpu','vCPU'),n('ramGb','RAM (GB)'),n('diskGb','Disk (GB)')];
const group = n('groupId','Resource group ID');
const network = n('vnetId','Virtual network ID');
const recordId = label => n('id',label+' ID');
const vmId = recordId('VM');
const hostId = recordId('Host');
const invoiceId = recordId('Invoice');
const form = (title,path,fields,method='POST',extra={}) => ({title,path,fields,method,...extra});
const table = (title,path,key=null,fields=null) => ({title,path,key,fields});
const page = (title,description,tables=[],forms=[],links=[]) => ({title,description,tables,forms,links});
const auth = {
 login:form('Sign in','/api/auth/login',[field('email','Email','email'),field('password','Password','password')]),
 register:form('Create an account','/api/auth/register',[s('role','Account type',['customer','provider']),t('firstName','First name'),t('lastName','Last name'),field('email','Email','email'),field('password','Password (12 characters minimum)','password'),field('confirmPassword','Confirm password','password')]),
 'verify-email':form('Verify email','/api/auth/verify-email',[t('token','Verification token')]),
 'resend-verification':form('Resend verification','/api/auth/resend-verification',[field('email','Email','email')]),
 'two-factor':form('Two-factor authentication','/api/auth/login/2fa',[t('code','Six-digit authenticator code')])
};
const notificationFields = ['id','title','message','created_at','is_read'];
const notifications = page('Notifications','Review billing messages in your inbox.',[
 table('Inbox','/api/notifications',null,notificationFields),
 table('Unread','/api/notifications?unread_only=true',null,notificationFields)
],[form('Mark as read','/api/notifications/:id/read',[recordId('Notification')],'PATCH')]);
const account = page('Account & Security','View your account and manage two-factor authentication.',[table('Profile','/api/auth/me','user'),table('Two-factor status','/api/auth/2fa/status')],[form('Start 2FA setup','/api/auth/2fa/setup',[]),form('Confirm 2FA','/api/auth/2fa/confirm',[t('code','Authenticator code')])]);
const invoice = (prefix) => [form('View invoice',prefix+'/invoices/:id',[invoiceId],'GET')];
const dates = [n('customer_id','Customer user ID (from Account & Security)'),field('billing_period_start','Period start','date'),field('billing_period_end','Period end','date')];
const customer = '/api/customers/me', provider='/api/providers/me', billing='/api/billing', finance='/api/finance', admin='/api/admin';
const resourceForms = [
 form('Resource group','/api/resource-groups',[t('name','Group name'),t('region','Region')]),
 form('Virtual network','/api/resource-groups/:groupId/virtual-networks',[group,t('name','Network name'),t('cidrBlock','IPv4 CIDR')]),
 form('Subnet','/api/resource-groups/:groupId/virtual-networks/:vnetId/subnets',[group,network,t('name','Subnet name'),t('cidrBlock','IPv4 CIDR')]),
 form('Virtual machine','/api/instances',[t('name','VM name'),n('subnetId','Subnet ID'),...capacity]),
 form('Load balancer','/api/resource-groups/:groupId/load-balancers',[group,network,t('name','Name'),...capacity,s('algorithm','Algorithm',['round_robin','least_connections'])]),
 ...['blob','file'].map(type=>form(type==='blob'?'Blob storage':'File storage','/api/resource-groups/:groupId/storage/'+type,[group,t('name','Name'),cls,n('sizeGb','Size (GB)')])),
 ...[['SQL_SERVER','Managed SQL Server'],['POSTGRESQL','Managed PostgreSQL'],['MYSQL','Managed MySQL']].map(([engine,label])=>form(label,'/api/resource-groups/:groupId/databases',[group,t('name','Database name'),cls,n('vcpu','vCPU'),n('ramGb','RAM (GB)'),n('sizeGb','Size (GB)')],'POST',{fixed:{engine}})),
 form('Web app','/api/resource-groups/:groupId/web-apps',[group,t('name','Name'),...capacity,n('databaseId','Database ID (optional)',true)])
];
const resourceCollections=[['Virtual networks','virtual-networks','Virtual network'],['Blob storage','storage/blob','Blob storage'],['File storage','storage/file','File storage'],['Managed databases','databases','Database'],['Load balancers','load-balancers','Load balancer'],['Web apps','web-apps','Web app']];
const groupPath='/api/resource-groups/:groupId/';
const hostFields=[t('name','Host name'),t('region','Region'),cls,n('totalCpu','Total CPU'),n('totalRamGb','RAM (GB)'),n('totalDiskGb','Disk (GB)')];
const portal = {
 customer:{
  overview:page('Overview','Manage your simulated cloud infrastructure.',[table('Resource groups','/api/resource-groups','resourceGroups'),table('Virtual machines','/api/instances','instances')],[],[['Create a resource','/resources'],['Billing and payments','/billing']]),
  resources:page('Resources','Create and manage all eleven resource types. Use List virtual networks, List subnets or List managed databases to find IDs for dependent resources.',[table('Resource groups','/api/resource-groups','resourceGroups'),table('Virtual machines','/api/instances','instances')],[
   ...resourceForms.map(x=>({...x,category:'create'})),
   ...resourceCollections.map(([label,p])=>form('List '+label,groupPath+p,[group],'GET')),
   form('List subnets',groupPath+'virtual-networks/:vnetId/subnets',[group,network],'GET'),
   ...resourceCollections.map(([label,p,idLabel])=>form('View '+label,groupPath+p+'/:id',[group,recordId(idLabel)],'GET')),
   form('View subnet',groupPath+'virtual-networks/:vnetId/subnets/:id',[group,network,recordId('Subnet')],'GET'),form('View resource group','/api/resource-groups/:id',[recordId('Resource group')],'GET'),
   ...['start','stop'].map(x=>form(x[0].toUpperCase()+x.slice(1)+' VM','/api/instances/:id/'+x,[vmId])),form('VM details','/api/instances/:id',[vmId],'GET'),form('Cancel VM','/api/instances/:id',[vmId],'DELETE'),
   ...resourceCollections.map(([label,p,idLabel])=>form('Cancel '+label,groupPath+p+'/:id',[group,recordId(idLabel)],'DELETE')),form('Cancel subnet',groupPath+'virtual-networks/:vnetId/subnets/:id',[group,network,recordId('Subnet')],'DELETE'),form('Cancel resource group','/api/resource-groups/:id',[recordId('Resource group')],'DELETE')]),
  billing:page('Billing & payments','Review invoices and estimate prices. Payments are simulated and no real money is transferred.',[table('Invoices',customer+'/invoices'),table('Payments',customer+'/payments'),table('Current rates','/api/pricing')],[
   ...invoice(customer),form('Pay invoice',customer+'/payments',[n('invoice_id','Invoice ID')]),
   form('Estimate monthly price','/api/pricing/calculate',[s('cloud_class','Cloud class',classes),n('cpu_cores','CPU cores'),n('ram_gb','RAM (GB)'),n('storage_gb','Storage (GB)'),n('gpu_units','GPU units',true)])]),
  advisor:page('AI Architecture Advisor','Describe your workload to receive a suggested architecture. Capacity estimates are advisory. No resources are provisioned automatically.',[],[form('Recommend an architecture','/api/ai/architecture/recommend',[field('requirements','Project requirements','textarea')])]),notifications,account
 },
 provider:{
  overview:page('Overview','Your registered hosts and financial performance.',[table('Hosts','/api/hosts','hosts'),table('Earnings',provider+'/earnings')],[],[['Add a host','/hosts']]),
  hosts:page('My Hosts','Register and manage your simulated computing capacity.',[table('Registered hosts','/api/hosts','hosts')],[form('Add host','/api/hosts',hostFields),form('View host','/api/hosts/:id',[hostId],'GET'),form('Update host','/api/hosts/:id',[hostId,t('name','Name',true),n('totalCpu','Total CPU',true),n('totalRamGb','RAM (GB)',true),n('totalDiskGb','Disk (GB)',true),s('status','Status',['available','maintenance','inactive'],true)],'PATCH'),form('Remove host','/api/hosts/:id',[hostId],'DELETE')]),
  capacity:page('Capacity & Allocations','Review total, used and available capacity per host.',[table('Host capacity','/api/hosts','hosts',['host_id','name','total_cpu','used_cpu','free_cpu','total_ram_gb','used_ram_gb','free_ram_gb','total_disk_gb','used_disk_gb','free_disk_gb'])]),
  earnings:page('Earnings','Review gross earnings, platform commission and net earnings.',[table('Earnings and history',provider+'/earnings')]),
  notifications,account
 },
 admin:{
  overview:page('Overview','Platform financial oversight.',[table('Platform summary',admin+'/dashboard')],[],[['Financial operations','/finance'],['Pricing','/pricing']]),
  finance:page('Financial management','Review simulated payments, earnings, and usage-based invoices.',[table('Financial summary',finance+'/dashboard'),table('Invoices',billing+'/invoices'),table('Payments',finance+'/payments'),table('Provider earnings',finance+'/earnings')],[
   ...invoice(billing),form('Preview usage invoice',billing+'/usage-invoices',dates,'POST',{fixed:{dry_run:true}}),
   form('Generate usage invoice',billing+'/usage-invoices',dates,'POST',{fixed:{dry_run:false}}),form('Cancel invoice',billing+'/invoices/:id/cancel',[invoiceId],'PATCH')]),
  pricing:page('Pricing management','Manage the current resource rates.',[table('Active rates','/api/pricing')],[form('Create pricing rule','/api/pricing',[s('resource_type','Resource',kinds),s('cloud_class','Class',classes),n('unit_price','Unit price')]),form('Update price','/api/pricing/:id',[recordId('Pricing rule'),n('unit_price','New price')],'PUT'),form('Retire price','/api/pricing/:id',[recordId('Pricing rule')],'DELETE')]),
  infrastructure:page('Infrastructure','Look up a virtual machine by ID.',[],[form('Look up VM','/api/instances/:id',[vmId],'GET')]),notifications,account
 }
};
module.exports={auth,portal,resourceTypes};
