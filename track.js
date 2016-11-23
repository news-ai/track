var express = require('express');
var cron = require('cron');
var request = require('requestretry');

var app = express();

var temporaryEmailOpens = {};

app.get('/', function(req, res) {
    var email_id = req.query.id;

    if (email_id) {
        var isnum = /^\d+$/.test(email_id);
        if (isnum) {
            if (!temporaryEmailOpens.hasOwnProperty(email_id)) {
                temporaryEmailOpens[email_id] = 0;
            }
            temporaryEmailOpens[email_id] += 1;

            res.status(204).send();
            return;
        }
    }

    res.send('No ID present.');
});

var cronJob = cron.job("*/60 * * * * *", function() {
    var temporaryEmailOpensArray = [];

    for (var key in temporaryEmailOpens) {
        if (temporaryEmailOpens.hasOwnProperty(key)) {
            console.log(temporaryEmailOpens);
            temporaryEmailOpensArray.push({
                id: key,
                event: 'open',
                count: temporaryEmailOpens[key]
            });
        }
    }

    temporaryEmailOpens = {};

    if (temporaryEmailOpensArray.length > 0) {
        // request({
        //     url: 'https://tabulae.newsai.org/api/incoming/internal_tracker',
        //     method: 'POST',
        //     json: temporaryEmailOpensArray,
        //     auth: {
        //         user: 'jebqsdFMddjuwZpgFrRo',
        //         password: ''
        //     },
        //     maxAttempts: 1
        // }, function(error, response, body) {
        //     if (!error && response.statusCode == 200) {

        //     } else {

        //     }
        // });
    }
});

app.listen(8080, function() {
    cronJob.start();
    console.log('Example app listening on port 8080!');
});
