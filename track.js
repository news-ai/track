'use strict';

var express = require('express');
var cron = require('cron');
var request = require('requestretry');
var elasticsearch = require('elasticsearch');
var Q = require('q');
var raven = require('raven');
var moment = require('moment');
var bodyParser = require('body-parser');

var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

// Internal
var temporaryEmailOpens = {};
var temporaryEmailClicks = {};

// Sendgrid
var temporarySendgridEmail = [];

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
            _type: 'log'
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

function getEmail(emailId) {
    var deferred = Q.defer();

    client.get({
        index: 'emails',
        type: 'email',
        id: emailId
    }).then(function(resp) {
        if (resp.found) {
            deferred.resolve(resp._source.data);
        } else {
            deferred.resolve({});
        }
    }, function(err) {
        deferred.resolve({});
    });

    return deferred.promise;
}

function getEmailTimeseries(userId) {
    var deferred = Q.defer();

    var dateToday = moment().format('YYYY-MM-DD');
    var esId = userId + '-' + dateToday;

    client.get({
        index: 'timeseries',
        type: 'useremail2',
        id: esId
    }).then(function(resp) {
        if (resp.found) {
            deferred.resolve(resp._source.data);
        } else {
            deferred.resolve({});
        }
    }, function(err) {
        deferred.resolve({});
    });

    return deferred.promise;
}

function appendEmailTimeseries(userId, timeseriesData) {
    var deferred = Q.defer();

    return deferred.promise;
}

function getAndLogEmailToTimeseries(emailId) {
    var deferred = Q.defer();

    getEmail(emailId).then(function(response) {
        var userId = response['CreatedBy'];
        getEmailTimeseries(userId).then(function(timeseries) {
            appendEmailTimeseries(userId, timeseries).then(function(status) {
                deferred.resolve(true);
            }, function(error) {
                console.error(error);
                sentryClient.captureMessage(error);
                deferred.resolve(false);
            })
        })
    }, function(error) {
        console.error(error);
        sentryClient.captureMessage(error);
        deferred.resolve(false);
    })

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

            var notificationLog = {
                'Type': 'open',
                'EmailId': email_id,
                'CreatedAt': moment(),
                'Link': ''
            };

            addNotificationToES(email_id, notificationLog).then(function(returnData) {
                getAndLogEmailToTimeseries(email_id).then(function(returnData){
                    res.send(buf, {
                        'Content-Type': 'image/gif'
                    }, 200);
                    res.end();
                    return;
                }, function (err) {
                    sentryClient.captureMessage(err);
                    res.send(buf, {
                        'Content-Type': 'image/gif'
                    }, 200);
                    res.end();
                    return;
                })
            }, function (err){
                sentryClient.captureMessage(err);
                res.send(buf, {
                    'Content-Type': 'image/gif'
                }, 200);
                res.end();
                return;
            });
        }
    } else {
        res.send('No ID present.');
        return;
    }
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

            var notificationLog = {
                'Type': 'click',
                'EmailId': email_id,
                'CreatedAt': moment(),
                'Link': email_url
            };

            addNotificationToES(email_id, notificationLog).then(function(returnData) {
                // Redirect
                res.writeHead(302, {
                    'Location': email_url
                });
                res.end();
                return;
            }, function (err){
                // If error then still redirect
                sentryClient.captureMessage(err);
                res.writeHead(302, {
                    'Location': email_url
                });
                res.end();
                return;
            });
        }
    } else {
        res.send('No ID present.');
        return;
    }
});

app.post('/sendgrid', function(req, res) {
    var data = req.body;

    /* Important SendGrid data
        - sg_message_id, email, timestamp, event, reason
    */

    for (var i = 0; i < data.length; i++) {
        var sendGridData = {
            'sg_message_id': data[i].sg_message_id || '',
            'email': data[i].email || '',
            'timestamp': data[i].timestamp || 0,
            'event': data[i].event || '',
            'reason': data[i].reason || ''
        };

        temporarySendgridEmail.push(sendGridData);
    }

    res.status(200);
    res.end();
    return;
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

    temporaryEmailInteractionsArray = temporaryEmailInteractionsArray.concat(temporarySendgridEmail);

    temporaryEmailOpens = {};
    temporaryEmailClicks = {};
    temporarySendgridEmail = [];

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