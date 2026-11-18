const resourceTypes = [
  ['resource-group', 'Resource Group', 'Organization', "Container for one environment's resources.", ['Customer account']],
  ['virtual-network', 'Virtual Network', 'Networking', 'Private address space for your resources.', ['Resource group']],
  ['subnet', 'Subnet', 'Networking', 'Address range inside a virtual network.', ['Virtual network']],
  ['load-balancer', 'Load Balancer', 'Networking', 'Distribute traffic across virtual machines in one network.', ['Resource group', 'Virtual network', 'Compatible VMs']],
  ['virtual-machine', 'Virtual Machine', 'Compute', 'Simulated server with vCPU, RAM and disk.', ['Resource group', 'Subnet', 'Available host capacity']],
  ['blob-storage', 'Blob Storage', 'Storage', 'Unstructured objects such as images and backups.', ['Resource group']],
  ['file-storage', 'File Storage', 'Storage', 'Shared file system for folders and documents.', ['Resource group']],
  ['managed-sql-server', 'Managed SQL Server', 'Databases', 'Simulated Microsoft SQL Server database.', ['Resource group']],
  ['managed-postgresql', 'Managed PostgreSQL', 'Databases', 'Simulated PostgreSQL database.', ['Resource group']],
  ['managed-mysql', 'Managed MySQL', 'Databases', 'Simulated MySQL database.', ['Resource group']],
  ['web-app', 'Web App', 'Applications', 'Simulated hosted web application.', ['Resource group']]
].map(([slug, label, category, description, prerequisites]) => ({ slug, label, category, description, prerequisites }));
const navigation = {
  customer: [['Overview', ''], ['Resources', '/resources'], ['Resource Groups', '/resource-groups'], ['Activity', '/activity'], ['Notifications', '/notifications'], ['Account & Security', '/account']],
  provider: [['Overview', ''], ['My Hosts', '/hosts'], ['Capacity & Allocations', '/capacity'], ['Activity', '/activity'], ['Notifications', '/notifications'], ['Account & Security', '/account']],
  admin: [['Overview', ''], ['Users', '/users'], ['Providers', '/providers'], ['Infrastructure', '/infrastructure'], ['Activity Logs', '/activity'], ['Account & Security', '/account']]
};
const group = { key: 'group', label: 'Resource group', kind: 'select', unavailable: 'Resource groups unavailable', required: true };
const region = { key: 'region', label: 'Region', kind: 'select', unavailable: 'Regions unavailable', required: true };
const inheritedRegion = { key: 'region', label: 'Region', kind: 'text', unavailable: 'From resource group', help: 'Inherited from the selected resource group.' };
const network = { key: 'network', label: 'Virtual network', kind: 'select', unavailable: 'Virtual networks unavailable', required: true };
const subnet = { key: 'subnet', label: 'Subnet', kind: 'select', unavailable: 'Subnets unavailable', required: true };
const hosting = { key: 'hostingClass', label: 'Hosting class', kind: 'radio', options: ['Economy', 'Business', 'Critical'], required: true };
const capacities = ['cpu', 'ram', 'disk'].map((key, index) => ({ key, label: ['vCPU','RAM (GB)','Disk (GB)'][index], kind: 'number', min: 1, required: true }));
function nameField(label) {
  return { key: 'name', label, kind: 'text', required: true, rule: 'resource-name', help: 'Lowercase letters, numbers and hyphens.' };
}
function resourceFields(type) {
  if (type.slug === 'resource-group') return [
    { key: 'name', label: 'Resource group name', kind: 'text', required: true, rule: 'group-name', help: '3–64 characters. Letters, numbers, spaces and hyphens.' }, region
  ];
  if (type.slug === 'subnet') return [nameField('Subnet name'), network,
    { key: 'cidr', label: 'Address range', kind: 'text', required: true, rule: 'cidr', help: 'Containment and overlap checks require the parent network records.' }];
  const fields = [nameField(type.category === 'Databases' ? 'Database name' : type.label + ' name'), group, inheritedRegion];
  if (type.slug === 'virtual-network') fields.push({ key: 'cidr', label: 'Address space', kind: 'text', required: true, rule: 'cidr', help: 'IPv4 network address, for example 10.0.0.0/16.' });
  if (type.slug === 'virtual-machine') fields.push(network, subnet, hosting, ...capacities);
  if (type.slug === 'load-balancer') fields.push(network, { key: 'targets', label: 'Target virtual machines', kind: 'select', unavailable: 'Compatible VMs unavailable', required: true, help: 'Select at least one target VM in the chosen network.' });
  if (type.slug === 'web-app') fields.push({ key: 'database', label: 'Managed database (optional)', kind: 'select', unavailable: 'Compatible databases unavailable', help: 'A web app can be created without a database.' });
  return fields;
}
const hostFields = [nameField('Host name'), region, { key: 'status', label: 'Initial availability', kind: 'select', options: ['Available', 'Unavailable'], required: true }, hosting, ...capacities];
const password = { key: 'password', label: 'Password', kind: 'password', required: true, autocomplete: 'new-password' };
const confirmation = { key: 'confirmPassword', label: 'Confirm password', kind: 'password', required: true, autocomplete: 'new-password', rule: 'confirmation' };
const email = { key: 'email', label: 'Email', kind: 'email', required: true, autocomplete: 'email' };
const authFields = {
  login: [email, { ...password, autocomplete: 'current-password' }],
  register: [
    { key: 'role', label: 'Account type', kind: 'radio', options: ['Customer','Provider'], required: true },
    { key: 'firstName', label: 'First name', kind: 'text', required: true, autocomplete: 'given-name' },
    { key: 'lastName', label: 'Last name', kind: 'text', required: true, autocomplete: 'family-name' },
    email, { ...password, help: 'Use a long, unique password. Final requirements must follow the existing backend contract.' }, confirmation
  ],
  code: [{ key: 'code', label: 'Authenticator code', kind: 'text', required: true, rule: 'totp', autocomplete: 'one-time-code', help: 'Enter the current six-digit code from your authenticator app.' }],
  email: [email], reset: [{ ...password, label: 'New password' }, confirmation]
};
module.exports = { resourceTypes, navigation, resourceFields, hostFields, authFields };

