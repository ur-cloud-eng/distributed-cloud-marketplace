const { resourceTypes, resourceFields, hostFields, authFields } = require('./design');
function table(title, description, columns, extras = {}) {
  return { template: 'pages/list', title, description, columns, ...extras };
}
function portalPages(role) {
  const base = '/preview/' + role;
  const activityColumns = role === 'customer' ? ['Time','Action','Resource','Type','State change','Result'] : role === 'provider' ? ['Time','Event','Host','Detail','Result'] : ['Time','User','Role','Action','Resource','State change','Result'];
  const pages = {
    '': { template: 'pages/overview', title: 'Overview', description: role === 'customer' ? 'Your infrastructure at a glance.' : role === 'provider' ? 'Registered hosts and the capacity customers use.' : 'Platform oversight.',
      metrics: role === 'customer' ? ['Resource groups','Resources','Running VMs','Stopped VMs'] : role === 'provider' ? ['Registered hosts','Available hosts','Total CPU','Allocated CPU','Available RAM','Available disk'] : ['Users','Provider hosts','Free capacity','Customer resources'],
      columns: activityColumns, action: role === 'customer' ? ['Create resource', base + '/resources/create'] : role === 'provider' ? ['Add host', base + '/hosts/create'] : null },
    '/activity': table(role === 'admin' ? 'Activity Logs' : 'Activity', 'A chronological record of account and resource events.', activityColumns, { filters: role === 'admin' ? ['Role','Action','Result','Period'] : ['Type','Result','Period'] }),
    '/notifications': { template: 'pages/notifications', title: 'Notifications', description: 'Resource and security messages for your account.' },
    '/account': { template: 'pages/account', title: 'Account & Security', description: 'Manage your details and sign-in protection.', fields: ['First name','Last name','Email'].map((label, index) => ({ key: ['firstName','lastName','email'][index], label, kind: index === 2 ? 'email' : 'text', unavailable: 'Profile unavailable' })) }
  };
  if (role === 'customer') Object.assign(pages, {
    '/resources': table('Resources', 'All resources across your resource groups.', ['Name','Type','Resource group','Region','Status','Created'], { filters: ['Type','Group','Status'], action: ['Create resource',base+'/resources/create'] }),
    '/resource-groups': table('Resource Groups','A group holds the resources of one environment.', ['Name','Region','Status','Resources','Contains','Created'], { action: ['Create resource group',base+'/resources/create/resource-group'] }),
    '/resources/create': { template: 'pages/catalog', title: 'Create resource', description: 'Choose a resource type.', breadcrumbs: [['Resources',base+'/resources']] },
    '/dependencies': { template: 'pages/dependencies', title: 'Infrastructure dependencies', description: 'How resources in a group depend on each other.' },
    '/resource-groups/details': { template: 'pages/group', title: 'Resource group details', description: 'Resources and dependencies in one environment.', breadcrumbs: [['Resource Groups',base+'/resource-groups']] }
  });
  if (role === 'provider') Object.assign(pages, {
    '/hosts': table('My Hosts','Your registered simulated computing capacity.', ['Host','Region','Class','Status','CPU','RAM','Disk','Available capacity'], { action: ['Add host',base+'/hosts/create'] }),
    '/hosts/create': { template: 'pages/form', title: 'Add host', description: 'Register simulated capacity for customers to use.', fields: hostFields, prerequisites: ['Provider account','Unique host name','Valid region and capacity'], cancel: base+'/hosts', actionLabel: 'Add host', breadcrumbs: [['My Hosts',base+'/hosts']] },
    '/hosts/details': { template: 'pages/host', title: 'Host details', description: 'Capacity, metadata and allocated virtual machines.', breadcrumbs: [['My Hosts',base+'/hosts']] },
    '/capacity': { template: 'pages/capacity', title: 'Capacity & Allocations', description: 'Allocated and remaining capacity across your hosts.' }
  });
  if (role === 'admin') Object.assign(pages, {
    '/users': table('Users','Registered users across the platform.', ['Name','Email','Role','Email status','Registered'], { filters: ['Role','Email status'] }),
    '/users/details': { template: 'pages/person', title: 'User details', description: 'Profile, security and activity.', breadcrumbs: [['Users',base+'/users']], provider: false },
    '/providers': table('Providers','Providers and their registered capacity.', ['Provider','Email','Hosts','Regions','vCPU','Free RAM','Free disk']),
    '/providers/details': { template: 'pages/person', title: 'Provider details', description: 'Provider profile, hosts and capacity.', breadcrumbs: [['Providers',base+'/providers']], provider: true },
    '/infrastructure': { template: 'pages/infrastructure', title: 'Infrastructure', description: 'Everything on the platform, by kind.' },
    '/infrastructure/details': { template: 'pages/resource', title: 'Infrastructure details', description: 'Resource inspection.', resourceType: resourceTypes[4], readOnly: true, breadcrumbs: [['Infrastructure',base+'/infrastructure']] }
  });
  return pages;
}
const authPages = {
  login: { title: 'Sign in', description: 'Welcome back to CortexOps.', fields: authFields.login, actionLabel: 'Sign in' },
  register: { title: 'Create your account', description: 'Choose how you will use CortexOps.', fields: authFields.register, actionLabel: 'Create account' },
  'verify-email': { title: 'Check your email', description: 'Open your verification email to activate your account.', fields: [] },
  'verification-result': { title: 'Email verification', description: 'Verification result screens from the approved design.', fields: [] },
  'two-factor/setup': { title: 'Set up two-factor authentication', description: 'Add a code from an authenticator app to your sign-in.', fields: authFields.code, actionLabel: 'Enable 2FA' },
  'two-factor/verify': { title: 'Two-factor authentication', description: 'Enter the six-digit code from your authenticator app.', fields: authFields.code, actionLabel: 'Verify' },
  'forgot-password': { title: 'Reset your password', description: 'Enter your email to request a reset link.', fields: authFields.email, actionLabel: 'Send reset link' },
  'check-email': { title: 'Check your email', description: 'A password reset email can be requested from the connected service.', fields: [] },
  'reset-password': { title: 'Choose a new password', description: 'Use a long, unique password.', fields: authFields.reset, actionLabel: 'Reset password' }
};
module.exports = { portalPages, authPages, resourceTypes, resourceFields };

