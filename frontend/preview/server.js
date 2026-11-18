const express = require('express');
const path = require('node:path');
const { portalPages, authPages, resourceTypes, resourceFields } = require('./pages');
const { navigation } = require('./design');
const app = express();
app.disable('x-powered-by');
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'ejs');
app.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  next();
});
app.use('/assets', express.static(path.join(__dirname, '../public')));
app.get('/favicon.ico', (_req, res) => res.status(204).end());
app.get('/', (_req, res) => res.redirect('/preview/customer'));
function renderPortal(res, role, url, page) {
  res.render('layout', { role, base: '/preview/' + role, navigation: navigation[role], currentPath: url, resourceTypes, action: null, breadcrumbs: [], filters: [], ...page });
}
for (const role of ['customer','provider','admin']) {
  for (const [suffix, page] of Object.entries(portalPages(role))) {
    const url = '/preview/' + role + suffix;
    app.get(url, (_req, res) => renderPortal(res, role, url, page));
  }
}
for (const type of resourceTypes) {
  const base = '/preview/customer';
  const url = base + '/resources/create/' + type.slug;
  app.get(url, (_req, res) => renderPortal(res, 'customer', url, {
    template: 'pages/form', title: 'Create ' + type.label.toLowerCase(), description: type.description,
    fields: resourceFields(type), prerequisites: type.prerequisites, cancel: base + '/resources/create', actionLabel: 'Create ' + type.label.toLowerCase(),
    breadcrumbs: [['Resources',base+'/resources'],['Create resource',base+'/resources/create']]
  }));
  const detailUrl = base + '/resources/details/' + type.slug;
  app.get(detailUrl, (_req, res) => renderPortal(res, 'customer', detailUrl, {
    template: 'pages/resource', title: type.label + ' details', description: type.description,
    resourceType: type, readOnly: false, breadcrumbs: [['Resources',base+'/resources']]
  }));
}
for (const [key, page] of Object.entries(authPages)) {
  app.get('/preview/auth/' + key, (req, res) => res.render('auth/page', { ...page, key, state: typeof req.query.state === 'string' ? req.query.state : '' }));
}
app.get('/preview', (_req, res) => {
  const groups = ['customer', 'provider', 'admin'].map(role => ({
    label: role === 'admin' ? 'Administrator' : role === 'provider' ? 'Provider' : 'Customer',
    links: Object.entries(portalPages(role)).map(([suffix, page]) => [page.title, '/preview/' + role + suffix])
  }));
  groups.push({ label: 'Resource creation', links: resourceTypes.map(type => [type.label, '/preview/customer/resources/create/' + type.slug]) });
  groups.push({ label: 'Resource details', links: resourceTypes.map(type => [type.label, '/preview/customer/resources/details/' + type.slug]) });
  groups.push({ label: 'Authentication', links: Object.entries(authPages).map(([key,page]) => [page.title, '/preview/auth/' + key]) });
  res.render('preview-index', { title: 'Frontend screens', groups });
});
app.use((_req, res) => res.status(404).render('errors/not-found', { title: 'Page not found' }));
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, '127.0.0.1', () => console.log('CortexOps EJS frontend preview at http://127.0.0.1:' + port));
server.on('error', error => { console.error('Preview startup failed:',error.message); process.exitCode = 1; });

