var express = require('express');
var cron = require('cron');
var request = require('requestretry');

var app = express();

var temporaryEmailOpens = [];

app.get('/', function(req, res) {
    res.send('Hello World!');
});

app.listen(3000, function() {
    console.log('Example app listening on port 3000!');
});

var cronJob = cron.job("*/60 * * * * *", function() {
    // perform operation e.g. GET request http.get() etc.
    console.info('cron job completed');
    request({
        url: 'https://tabulae.newsai.org/api/incoming/internal_tracker',
        method: 'POST',
        json: temporaryEmailOpens,
        auth: {
            user: 'jebqsdFMddjuwZpgFrRo',
            password: ''
        },
        maxAttempts: 1
    }, function(error, response, body) {
        if (!error && response.statusCode == 200) {

        } else {

        }
    });
});

cronJob.start();