/*
I discovered that in Node.js a function can overwrite the very file that contains the function.
I find it very interesting. The concept of a program that can rewrite itself is kind of fun.
However, this is probably more of a what not to do, as you could lose the whole file if implemented, by overwriting with junk.
Here's an example of it saving a new access token. But again, it would be wiser to stick the access token in a separate file.
*/

// AGAIN, WHAT NOT TO DO!
let request = require('request');
let fs = require('fs');
let env = require('./env');
class HelpscoutAuthService {
    constructor() {
        this._access_token = 'TOTALLYRANDOMTOKEN';
    }
    get access_token() {
        return this._access_token;
    }
    logIn() {
        fs.readFile('./hsAuth.js', (err, data) => {
            let textChunk = data.toString('utf8');
            getNewAuthToken()
                .then(token => {
                    textChunk = textChunk.replace(this._access_token, token);
                    fs.writeFile('./hsAuth.js', textChunk, function (err) {
                        if (err) throw err;
                        console.log('Saved New Helpscout Auth Code!');
                    });
                });
        });
    }
}

module.exports = HelpscoutAuthService;

function getNewAuthToken() {
    return new Promise((resolve, reject) => {
        let authClientBody = {
            grant_type: 'client_credentials',
            client_id: env.hs.CLIENT_ID,
            client_secret: env.hs.CLIENT_SECRET
        };
        let authClientOptions = {
            method: 'POST',
            url: 'https://api.helpscout.net/v2/oauth2/token',
            body: authClientBody,
            json: true,
            authorization: 'Bearer ' + env.hs.CLIENT_ID
        };
        request(authClientOptions, (err, res, body) => {
            if (err) {
                // HANDLE ERROR
            } else {
                console.log('Helpscout access_token:',body.access_token);
                resolve(body.access_token);
            }
        });
    });
}
