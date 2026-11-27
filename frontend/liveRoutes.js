const path = require('path');
const express = require('express');
const { checkAuthorization } = require('../backend/BLL/auth/userService');
const { resourceTypes } = require('./preview/design');
const pages = require('./livePages');
const nav = {
    customer: [['Overview',''],['Resources','/resources'],['Billing','/billing'],['AI Advisor','/advisor'],['Notifications','/notifications'],['Account','/account']],
    provider: [['Overview',''],['My Hosts','/hosts'],['Capacity','/capacity'],['Earnings','/earnings'],['Withdrawals','/withdrawals'],['Notifications','/notifications'],['Account','/account']],
    admin: [['Overview',''],['Finance','/finance'],['Pricing','/pricing'],['Infrastructure','/infrastructure'],['Notifications','/notifications'],['Account','/account']]
};
module.exports = function(app) {
    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'ejs');
    app.use('/assets', express.static(path.join(__dirname, 'public')));
    for (const [url, title] of Object.entries({'/':'Cloud resources, made accessible','/about':'About CortexOps','/contact':'Contact','/services':'Cloud services','/pricing':'Pricing'})) {
        app.get(url, (req,res) => res.render('live/public', {title,url,resourceTypes}));
    }
    for (const key of ['login','register','verify-email','resend-verification','two-factor']) {
        app.get('/'+key, (req,res) => {
            res.set('Cache-Control','no-store');
            res.set('Referrer-Policy','no-referrer');
            if (key === 'two-factor' && !req.session.pending2FA) return res.redirect('/login');
            res.render('live/auth',{title:pages.auth[key].title,key,config:pages.auth[key]});
        });
    }
    app.get('/portal', (req,res) => {
        const role = String(req.session.user?.role || '').toLowerCase();
        res.redirect(nav[role] ? '/portal/'+role : '/login');
    });
    app.get(['/portal/:role','/portal/:role/:page'], async (req,res,next) => {
        const {role} = req.params;
        const user = req.session.user;
        if (!user) return res.redirect('/login');
        const sessionRole = String(user.role).toLowerCase();
        if (!nav[sessionRole]) return res.redirect('/login');
        if (role !== sessionRole) return res.redirect('/portal/'+sessionRole);
        try {
            const failure = await checkAuthorization(user.userId, role, [role]);
            if (failure) return res.status(failure.status).send('Account access unavailable.');
            const key = req.params.page || 'overview';
            const config = pages.portal[role][key];
            if (!config || !Object.hasOwn(pages.portal[role],key)) return res.status(404).send('Page not found');
            const base = '/portal/'+role;
            res.set('Cache-Control','no-store');
            res.render('live/portal',{title:config.title,config,key,role,base,navigation:nav[role],currentPath:req.path});
        } catch (error) { next(error); }
    });
};
