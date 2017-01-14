'use strict';

var express = require('express');
var cron = require('cron');
var request = require('requestretry');
var elasticsearch = require('elasticsearch');
var Q = require('q');

var app = express();

var temporaryEmailOpens = {};
var temporaryEmailClicks = {};

// Instantiate a elasticsearch client
var client = new elasticsearch.Client({
    host: 'https://newsai:XkJRNRx2EGCd6@search1.newsai.org',
    // log: 'trace',
    rejectUnauthorized: false
});

// Instantiate a sentry client
var sentryClient = new raven.Client('https://9cf3075371f04df6b6596d104b17ee70:6a912fbe852a4e67a984821a8eccd431@sentry.io/129310');
sentryClient.patchGlobal();

function addNotificationToES(emailId, notificationType) {
    var deferred = Q.defer();

    var esActions = [];
    var indexRecord = {
        index: {
            _index: 'emails',
            _type: 'log',
            _id: emailId
        }
    };
    var dataRecord = notificationType;

    esActions.push(indexRecord);
    esActions.push({
        data: dataRecord
    });

    client.bulk({
        body: esActions
    }, function(error, response) {
        if (error) {
            console.error(error);
            sentryClient.captureMessage(error);
            deferred.resolve(false);
        }
        deferred.resolve(true);
    });

    return deferred.promise;
}

app.get('/', function(req, res) {
    var email_id = req.query.id;

    if (email_id) {
        var isnum = /^\d+$/.test(email_id);
        if (isnum) {
            if (!temporaryEmailOpens.hasOwnProperty(email_id)) {
                temporaryEmailOpens[email_id] = 0;
            }
            temporaryEmailOpens[email_id] += 1;

            var buf = new Buffer(35);
            buf.write("R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=", "base64");
            res.send(buf, {
                'Content-Type': 'image/gif'
            }, 200);

            return;
        }
    }

    res.send('No ID present.');
});

app.get('/a', function(req, res) {
    var rawQueryParameters = require('url').parse(req.url).query;
    var emailUrlRaw = rawQueryParameters.split('&url=');

    if (emailUrlRaw.length > 1) {
        emailUrlRaw = emailUrlRaw[1];
    } else {
        emailUrlRaw = false;
    }

    var email_id = req.query.id;
    var email_url = emailUrlRaw || req.query.url;

    if (email_id) {
        var isnum = /^\d+$/.test(email_id);
        if (isnum) {
            if (!temporaryEmailClicks.hasOwnProperty(email_id)) {
                temporaryEmailClicks[email_id] = 0;
            }
            temporaryEmailClicks[email_id] += 1;

            res.writeHead(302, {
                'Location': email_url
            });

            res.end();
            return;
        }
    }

    res.send('No ID present.');
});

var cronJob = cron.job("*/60 * * * * *", function() {
    var temporaryEmailInteractionsArray = [];

    for (var key in temporaryEmailOpens) {
        if (temporaryEmailOpens.hasOwnProperty(key)) {
            temporaryEmailInteractionsArray.push({
                id: key,
                event: 'open',
                count: temporaryEmailOpens[key]
            });
        }
    }

    for (var key in temporaryEmailClicks) {
        if (temporaryEmailClicks.hasOwnProperty(key)) {
            temporaryEmailInteractionsArray.push({
                id: key,
                event: 'click',
                count: temporaryEmailClicks[key]
            });
        }
    }

    temporaryEmailOpens = {};
    temporaryEmailClicks = {};

    if (temporaryEmailInteractionsArray.length > 0) {
        console.log(temporaryEmailInteractionsArray);
        request({
            url: 'https://tabulae.newsai.org/api/incoming/internal_tracker',
            method: 'POST',
            json: temporaryEmailInteractionsArray,
            auth: {
                user: 'jebqsdFMddjuwZpgFrRo',
                password: ''
            },
            maxAttempts: 1
        }, function(error, response, body) {
            if (error) {
                console.error(error);
            }
        });
    }
});

app.listen(8080, function() {
    cronJob.start();
    console.log('Example app listening on port 8080!');
});