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
const id = n('id','Record ID');
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
const notifications = page('Notifications','Messages from your account and financial operations.',[table('Inbox','/api/notifications')],[form('Mark as read','/api/notifications/:id/read',[id],'PATCH')]);
const account = page('Account & Security','View your account and manage two-factor authentication.',[table('Profile','/api/auth/me','user'),table('Two-factor status','/api/auth/2fa/status')],[form('Start 2FA setup','/api/auth/2fa/setup',[]),form('Confirm 2FA','/api/auth/2fa/confirm',[t('code','Authenticator code')])]);
const invoice = (prefix) => [form('View invoice',prefix+'/invoices/:id',[id],'GET')];
const dates = [n('customer_id','Customer ID'),field('billing_period_start','Period start','date'),field('billing_period_end','Period end','date'),t('discount_code','Discount code (optional)',true)];
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
const resourceCollections=[['Virtual networks','virtual-networks'],['Blob storage','storage/blob'],['File storage','storage/file'],['Managed databases','databases'],['Load balancers','load-balancers'],['Web apps','web-apps']];
const groupPath='/api/resource-groups/:groupId/';
const hostFields=[t('name','Host name'),t('region','Region'),cls,n('totalCpu','Total CPU'),n('totalRamGb','RAM (GB)'),n('totalDiskGb','Disk (GB)')];
const discountFields=[t('code','Code'),s('discount_type','Type',['Percentage','Fixed']),n('discount_value','Value'),n('max_uses','Maximum uses',true),field('expires_at','Expiration (optional)','datetime-local',null,true)];
const portal = {
 customer:{
  overview:page('Overview','Manage your simulated cloud infrastructure.',[table('Resource groups','/api/resource-groups','resourceGroups'),table('Virtual machines','/api/instances','instances')],[],[['Create a resource','/resources'],['Billing and payments','/billing']]),
  resources:page('Resources','Create and manage all eleven resource types.',[table('Resource groups','/api/resource-groups','resourceGroups'),table('Virtual machines','/api/instances','instances')],[...resourceForms.map(x=>({...x,category:'create'})),...resourceCollections.map(([label,p])=>form('List '+label,groupPath+p,[group],'GET')),form('List subnets',groupPath+'virtual-networks/:vnetId/subnets',[group,network],'GET'),...resourceCollections.map(([label,p])=>form('View '+label,groupPath+p+'/:id',[group,id],'GET')),form('View subnet',groupPath+'virtual-networks/:vnetId/subnets/:id',[group,network,id],'GET'),form('View resource group','/api/resource-groups/:id',[id],'GET'),...['start','stop','restart'].map(x=>form(x+' VM','/api/instances/:id/'+x,[id])),form('VM details','/api/instances/:id',[id],'GET'),form('VM activity','/api/instances/:id/activity',[id],'GET'),form('Assign IP','/api/instances/:id/ip',[id]),form('Release IP','/api/instances/:id/ip',[id],'DELETE'),form('Cancel VM','/api/instances/:id',[id],'DELETE'),...resourceCollections.map(([label,p])=>form('Cancel '+label,groupPath+p+'/:id',[group,id],'DELETE')),form('Cancel subnet',groupPath+'virtual-networks/:vnetId/subnets/:id',[group,network,id],'DELETE'),form('Cancel resource group','/api/resource-groups/:id',[id],'DELETE'),form('List balancer targets',groupPath+'load-balancers/:id/targets',[group,id],'GET'),form('Add balancer target',groupPath+'load-balancers/:id/targets',[group,id,n('vmId','VM ID')]),form('Remove balancer target',groupPath+'load-balancers/:id/targets/:vmId',[group,id,n('vmId','VM ID')],'DELETE')]),
  billing:page('Billing & payments','Manage invoices, simulated payments, refunds and price estimates.',[table('Invoices',customer+'/invoices'),table('Payments',customer+'/payments'),table('Refund requests',customer+'/refunds'),table('Current rates','/api/pricing')],[...invoice(customer),form('Pay invoice',customer+'/payments',[n('invoice_id','Invoice ID')]),form('Request refund',customer+'/refunds',[n('payment_id','Payment ID'),n('amount','Amount (optional)',true),t('reason','Reason')]),form('Estimate monthly price','/api/pricing/calculate',[s('cloud_class','Cloud class',classes),n('cpu_cores','CPU cores'),n('ram_gb','RAM (GB)'),n('storage_gb','Storage (GB)'),n('gpu_units','GPU units',true)]),form('Validate discount','/api/discounts/validate',[t('code','Discount code'),n('subtotal','Subtotal (optional)',true)])]),
  advisor:page('AI Architecture Advisor','Describe your workload to receive a suggested architecture. No resources are provisioned automatically.',[],[form('Recommend an architecture','/api/ai/architecture/recommend',[field('requirements','Project requirements','textarea')])]),notifications,account
 },
 provider:{
  overview:page('Overview','Your registered hosts and financial performance.',[table('Hosts','/api/hosts','hosts'),table('Earnings',provider+'/earnings')],[],[['Add a host','/hosts'],['Withdrawals','/withdrawals']]),
  hosts:page('My Hosts','Register and manage your simulated computing capacity.',[table('Registered hosts','/api/hosts','hosts')],[form('Add host','/api/hosts',hostFields),form('View host','/api/hosts/:id',[id],'GET'),form('Update host','/api/hosts/:id',[id,t('name','Name',true),n('totalCpu','Total CPU',true),n('totalRamGb','RAM (GB)',true),n('totalDiskGb','Disk (GB)',true),s('status','Status',['available','maintenance','inactive'],true)],'PATCH'),form('Remove host','/api/hosts/:id',[id],'DELETE')]),
  capacity:page('Capacity & Allocations','Review total, used and available capacity per host.',[table('Host capacity','/api/hosts','hosts',['host_id','name','total_cpu','used_cpu','free_cpu','total_ram_gb','free_ram_gb','total_disk_gb','free_disk_gb'])]),
  earnings:page('Earnings','Review gross earnings, platform commission and net earnings.',[table('Earnings and history',provider+'/earnings')]),
  withdrawals:page('Withdrawals','Request a simulated withdrawal and track approval.',[table('Withdrawal history',provider+'/withdrawals')],[form('Request withdrawal',provider+'/withdrawals',[n('amount','Amount'),t('note','Note (optional)',true)])]),notifications,account
 },
 admin:{
  overview:page('Overview','Platform financial oversight.',[table('Platform summary',admin+'/dashboard')],[],[['Financial operations','/finance'],['Pricing','/pricing'],['Audit log','/audit']]),
  finance:page('Financial management','Review transactions and manage billing and approvals.',[table('Financial summary',admin+'/dashboard'),table('Invoices',billing+'/invoices'),table('Payments',finance+'/payments'),table('Refund requests',admin+'/refunds'),table('Recorded refunds',finance+'/refunds'),table('Provider earnings',finance+'/earnings'),table('Withdrawals',finance+'/withdrawals')],[...invoice(billing),form('Preview usage invoice',billing+'/usage-invoices',dates,'POST',{fixed:{dry_run:true}}),form('Generate usage invoice',billing+'/usage-invoices',dates,'POST',{fixed:{dry_run:false}}),form('Cancel invoice',billing+'/invoices/:id/cancel',[id],'PATCH'),form('Decide refund',admin+'/refunds/:id',[id,s('status','Decision',['Approved','Rejected']),t('admin_note','Note',true)],'PATCH'),form('Record refund',finance+'/refunds',[n('payment_id','Payment ID'),n('amount','Amount'),t('reason','Reason',true)]),form('Decide withdrawal',finance+'/withdrawals/:id',[id,s('status','Decision',['Approved','Rejected','Paid'])],'PATCH')],[['Discount codes','/discounts'],['Audit log','/audit']]),
  pricing:page('Pricing management','Manage active rates and view their history.',[table('Active rates','/api/pricing')],[form('Create pricing rule','/api/pricing',[s('resource_type','Resource',kinds),s('cloud_class','Class',classes),n('unit_price','Unit price')]),form('Update price','/api/pricing/:id',[id,n('unit_price','New price')],'PUT'),form('Retire price','/api/pricing/:id',[id],'DELETE'),form('View price history','/api/pricing/:id/history',[id],'GET')]),
  discounts:page('Discount codes','Create, edit or deactivate discount codes.',[table('Discounts','/api/discounts')],[form('Create code','/api/discounts',discountFields),form('Update code','/api/discounts/:id',[id,...discountFields.map(f=>({...f,optional:true})),s('active','Active',['true','false'],true)],'PATCH')]),
  audit:page('Financial audit log','Review recent financial events.',[table('Audit history',admin+'/audit-log')]),
  infrastructure:page('Infrastructure','Admin-wide user, provider and resource listings need backend endpoints. Existing admin VM lookup and lifecycle actions are available.',[],[form('Look up VM','/api/instances/:id',[id],'GET'),form('VM activity','/api/instances/:id/activity',[id],'GET')]),notifications,account
 }
};
module.exports={auth,portal};
