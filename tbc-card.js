#!/usr/bin/env node
'use strict';


//
// Node.js modules sand 3rd party libs.
//
var lib = {
    http:        require('http'),
    https:       require('https'),
    fs:          require('fs'),
    path:        require('path'),
    url:         require('url'),
    querystring: require('querystring'),
    parseArgs:   require('minimist')
};


//
// TBC API commands.
//
var COMMAND = {
    REQUEST_DMS_TRANSACTION:  'a',
    CHECK_TRANSACTION_RESULT: 'c',
    MAKE_DMS_TRANSACTION:     't',
    REFUND_DMS_TRANSACTION:   'k',
    REVERSE_DMS_TRANSACTION:  'r',
    CLOSE_DMS_DAY:            'b'
};


//
// Currency IDs
//
var CURRENCY = {
    GEL: 981
};


//
// Handy constants.
//
var MAX_SOCKET_DATA_SIZE = 2 * 1000 * 1000; // 2MB in bytes.
var SIMPLE_IPv4_REGEX    = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;


//
// API config.
//
var apiConfig = {
    pfxFile: null,
    passphrase: null,
    failRedirectUrl: null,
    successRedirectUrl: null
};


//
// Public API
//
// https://nodejs.org/docs/latest/api/all.html#modules_accessing_the_main_module
var isCalledDirectly = (require.main === module);
var ARGV = {};

if (isCalledDirectly) {
    ARGV = lib.parseArgs(process.argv.slice(2));
    apiConfig.pfxFile = lib.fs.readFileSync(ARGV.pfxfile || process.env.TBC_PFX_FILE);
    apiConfig.passphrase = ARGV.passphrase || process.env.TBC_PASSPHRASE;

    if (!apiConfig.pfxFile || !apiConfig.passphrase) {
        console.log('Error: --pfxFile and --passphrase must be specified.');
        process.exit();
    }

    switch (ARGV.action) {
        case 'register':
            registerTransaction({ 
                amount: ARGV.amount, 
                client_ip_address: ARGV.ip 
            }, function (err, response) {
                if (err) {
                    return console.log('ERROR OCCURED:', err);
                }
                console.log(new Date());
                console.log(response);
            });
            break;
        case 'check':
            checkTransaction({
                transaction_id: ARGV.transactionid || ARGV.tid,
                client_ip_address: ARGV.ip 
            }, function (err, response) {
                if (err) {
                    return console.log('ERROR OCCURED:', err);
                }
                console.log(new Date());
                console.log(response);
            });
            break;
        case 'make':
            makeTransaction({
                transaction_id: ARGV.transactionid || ARGV.tid,
                amount: ARGV.amount, 
                client_ip_address: ARGV.ip 
            }, function (err, response) {
                if (err) {
                    return console.log('ERROR OCCURED:', err);
                }
                console.log(new Date());
                console.log(response);
            });
            break;
        case 'cancel':
            cancelTransaction({
                transaction_id: ARGV.transactionid || ARGV.tid
            }, function (err, response) {
                if (err) {
                    return console.log('ERROR OCCURED:', err);
                }
                console.log(new Date());
                console.log(response);
            });
            break;
        case 'refund':
            break;
        case 'close-day':
            closeDay({}, function (err, response) {
                if (err) {
                    return console.log('ERROR OCCURED:', err);
                }
                console.log(new Date());
                console.log(response);
            });
            break;
        default: 
            console.log('Error: A valid --action must be specified.');
    }
} else {
    module.exports = {
        config: config,
        registerTransaction: registerTransaction,
        checkTransaction: checkTransaction,
        makeTransaction: makeTransaction,
        cancelTransaction: cancelTransaction,
        closeDay: closeDay
    };
}


//
// Prepare module for querying. 
//
function config(options) {
    options = options || {};

    if (options.pfxFile) {
        apiConfig.pfxFile = lib.fs.readFileSync(options.pfxFile);
    }

    if (options.passphrase) {
        apiConfig.passphrase = options.passphrase;
    }

    if (options.failRedirectUrl) {
        apiConfig.failRedirectUrl = options.failRedirectUrl;
    }

    if (options.successRedirectUrl) {
        apiConfig.successRedirectUrl = options.successRedirectUrl;
    }
}


//
// Register requested amount of money and user's IP address 
// and get a TBC transaction id.
//
// amount - Amount to be paid in Lari.
// client_ip_addr - client's IP address, mandatory (15 characters)
// description (optional) - A transaction description useful for including extra details.
//
// TBC docs: 3.2.2 Registering DMS Authorization
//
function registerTransaction(params, callback) {
    params.amount = parseFloat(params.amount);

    if (!params.amount || params.amount < 0) {
        return callback({ error: 'A valid amount must be specified.' });
    }

    if (!params.client_ip_address || !SIMPLE_IPv4_REGEX.test(params.client_ip_address)) {
        return callback({ error: 'A valid client IP address must be specified.' });
    }

    var tbcFields = {
        command:        COMMAND.REQUEST_DMS_TRANSACTION,
        amount:         convertAmountToTetri(params.amount), 
        currency:       CURRENCY.GEL,
        client_ip_addr: params.client_ip_address,
        description:    params.description || 'Registering TBC CARD API Transaction',
        language:      'GE',
        msg_type:      'DMS'
    };

    tbcAPICall(tbcFields, function (err, tbcResponse) {
        if (err) { 
            return callback(err); 
        }
        callback(null, tbcResponse);
    });
}


//
// Check TBC transaction status.
//
// transaction_id - TBC's transaction identifier, mandatory (28 characters)
// client_ip_address - client's IP address, mandatory (15 characters)
//
// TBC docs: 3.2.4 Transaction result
//
// The RESULT_CODE and 3DSECURE fields are informative only and can be not shown.
// The fields RRN and APPROVAL_CODE appear for successful transactions only, 
// for informative purposes, and they facilitate tracking the transactions in Card Suite Processing RTPS system. 
//
// The decision as to whether a transaction was successful or failed 
// must be based on the value of RESULT field only.
//
//    RESULT:
//       OK              – successfully completed transaction.
//       FAILED          – transaction has failed.
//       CREATED         – transaction just registered in the system.
//       PENDING         – transaction is not accomplished yet.
//       DECLINED        – transaction declined by ECOMM, because ECI is in blocked ECI list (ECOMM server side configuration).
//       REVERSED        – transaction is reversed.
//       AUTOREVERSED    – transaction is reversed by autoreversal. 
//       TIMEOUT         – transaction was timed out.
//    RESULT_CODE        - transaction result code returned from Card Suite Processing RTPS (3 digits).
//    RRN                – retrieval reference number returned from Card Suite Processing RTPS.
//    APPROVAL_CODE      - approval code returned from Card Suite Processing RTPS (max 6 characters).
//    3DSECURE:
//       AUTHENTICATED   – successful 3D Secure authorization.
//       DECLINED        – failed 3D Secure authorization.
//       NOTPARTICIPATED – cardholder is not a member of 3D Secure scheme.
//       NO_RANGE        – card is not in 3D secure card range defined by issuer.
//       ATTEMPTED       – cardholder 3D secure authorization using attempts ACS server.
//       UNAVAILABLE     – cardholder 3D secure authorization is unavailable.
//       ERROR           – error message received from ACS server.
//       SYSERROR        – 3D secure authorization ended with system error.
//       UNKNOWNSCHEME   – 3D secure authorization was attempted by wrong card scheme (Dinners club, American Express).
//
function checkTransaction(params, callback) {
    if (!params.transaction_id) {
        return callback({ error: 'A valid TBC transaction ID must be specified.' });
    }

    if (!params.client_ip_address || !SIMPLE_IPv4_REGEX.test(params.client_ip_address)) {
        return callback({ error: 'A valid client IP address must be specified.' });
    }

    var tbcFields =  {
        command: COMMAND.CHECK_TRANSACTION_RESULT,
        trans_id: params.transaction_id,
        client_ip_addr: params.client_ip_address
    };

    tbcAPICall(tbcFields, function(err, tbcResponse) {
        if (err) {
            return callback(err);
        }
        return callback(null, tbcResponse);
    });
}


//
// Take registered money from user's account to merchant's account.
//
// amount - Amount to be paid in Lari.
// transaction_id - TBC's transaction identifier, mandatory (28 characters).
// client_ip_addr - client's IP address, mandatory (15 characters).
// description (optional) - A transaction description useful for including extra details.
//
// RESULT_CODE fields are informative only. The fields RRN and APPROVAL_CODE appear only for successful transactions, 
// for informative purposes, and they facilitate tracking the transactions in the Card Suite Processing RTPS system. 
//
// The decision as to whether a transaction was successful or failed 
// must be based on the value of RESULT field only.
//
//     RESULT:
//         OK        - successful transaction.
//         FAILED    - failed transaction.
//     RESULT_CODE   - transaction result code returned from Card Suite Processing RTPS (3 digits).
//     RRN           - retrieval reference number returned from Card Suite Processing RTPS (12 characters).
//     APPROVAL_CODE - approval code returned from Card Suite Processing RTPS (max 6 characters).
//     CARD_NUMBER   - masked card number.
//
function makeTransaction(params, callback) {
    params.amount = parseFloat(params.amount);

    if (!params.amount || params.amount < 0) {
        return callback({ error: 'A valid amount must be specified.' });
    }

    if (!params.transaction_id) {
        return callback({ error: 'A valid TBC transaction ID must be specified.' });
    }

    if (!params.client_ip_address || !SIMPLE_IPv4_REGEX.test(params.client_ip_address)) {
        return callback({ error: 'A valid client IP address must be specified.' });
    }

    var tbcFields =  {
        command:        COMMAND.MAKE_DMS_TRANSACTION,
        trans_id:       params.transaction_id,
        amount:         convertAmountToTetri(params.amount),
        currency:       CURRENCY.GEL,
        client_ip_addr: params.client_ip_address,
        description:    params.description || 'Executing CARD API Transaction',
        language:      'GE',
        msg_type:      'DMS'
    };

    tbcAPICall(tbcFields, function(err, tbcResponse) {
        if (err) {
            return callback(err);
        }
        return callback(null, tbcResponse);
    });
}


//
// Release (reverse) registered/blocked money on user's account.
//
//     RESULT:
//         OK – successful reversal transaction.
//         REVERSED – transaction has already been reversed.
//         FAILED – failed to reverse transaction (transaction status remains as it was).
//     RESULT_CODE   - reversal result code returned from Card Suite Processing RTPS (3 digits).
//
function cancelTransaction(params, callback) {
    if (!params.transaction_id) {
        return callback({ error: 'A valid TBC transaction ID must be specified.' });
    }

    var tbcFields =  {
        command: COMMAND.REVERSE_DMS_TRANSACTION,
        trans_id: params.transaction_id
    };

    tbcAPICall(tbcFields, function(err, tbcResponse) {
        if (err) {
            return callback(err);
        }
        return callback(null, tbcResponse);
    });
}


//
// TODO
//
// Close a payment day.
//
function closeDay(params, callback) {
    var tbcFields =  {
        command: COMMAND.CLOSE_DMS_DAY,
    };
    tbcAPICall(tbcFields, function(err, tbcResponse) {
        if (err) {
            return callback(err);
        }
        return callback(null, tbcResponse);
    });
}



//
// TODO
//
// Refund a transaction (not working).
// TODO: Needs clarification from TBC.
//
function refundTransaction(params, callback) {
    // params.transaction_id = parseInt(params.transaction_id, 10);

    // if (!params.transaction_id) {
    //     return callback(APP.ERROR.INVALID_PARAMETERS);
    // }

    // var qParams = [params.transaction_id, APP.PAYMENT_TRANSACTION_STATUS.SUCCESSFUL];
    // APP.lib.db.queryOne(APP.SQL.selectTransaction, qParams, function (err, transaction) {
    //     if (err) {
    //         return APP.serverError('APP.CREDIT_CARD.refundTransaction', err, callback); 
    //     } else if (!transaction || !transaction.remote_transaction_id) {
    //         return callback(APP.ERROR.INVALID_PARAMETERS);
    //     }
    //     var tbcFields =  {
    //         command: COMMAND.REFUND_DMS_TRANSACTION,
    //         trans_id: transaction.remote_transaction_id
    //     };
    //     tbcAPICall(tbcFields, function (err, tbcResponse) {
    //         if (err) {
    //             return callback(APP.ERROR.CARD_PAYMENT_ERROR);
    //         }
    //         return callback(null, tbcResponse);
    //     });
    // });
}


//
// Call TBC API
//
function tbcAPICall(fields, callback) {
    if (!apiConfig.pfxFile || !apiConfig.passphrase) {
        return callback({ error: 'Missing TBC API credentials.' });
    }
    var options = {
        method: 'POST',
        https: true,
        host: 'securepay.ufc.ge',
        port: 18443,
        path: '/ecomm2/MerchantHandler',
        pfx: apiConfig.pfxFile,
        passphrase: apiConfig.passphrase,
        securityOptions: 'SSL_OP_NO_SSLv3'
    };
    request(options, fields, function (err, response) {
        if (err) {
            return callback(err);
        }

        var tbcResponse =  parseTBCresponse(response.body);

        if (!Object.keys(tbcResponse).length) {
            return callback({ error: 'Invalid response from TBC API.' });
        }

        if (tbcResponse.error) {
            return callback({ error: tbcResponse.error });
        }

        callback(null, tbcResponse);
    });
}


//
// TBC requires amount in Tetri.
//
function convertAmountToTetri(amount) {
    return amount * 100;
}


//
// Convert TBC response to a Javascript object.
//
// Example response:
//    RESULT: CREATED
//    3DSECURE: FAILED
//
// Expected parsed result:
//    {
//        RESULT: "CREATED",
//        3DSECURE: "FAILED"
//    }
//
function parseTBCresponse(tbcResponse) {
    var data = {};
    var lines = tbcResponse.split('\n');
    
    try {
        lines.forEach(function (line) {
            var val = line.split(':');
            data[val[0].trim()] = val[1].trim();
        });
    } catch (e) {}

    return data;
}


//
// Handy wrapper for Node's http.request
// https://nodejs.org/api/http.html#http_http_request_options_callback
//
//    request({
//        method: 'GET',
//        host: 'apple.com',
//        path: '/ipad'
//    }, function (err, response) {
//        console.log(response.body);
//    });
//
function request(options, params, callback) {
    var isHTTPS = options.https || options.protocol === 'https:';

    options.method   = options.method   || 'GET';
    options.hostname = options.hostname || options.host;
    options.headers  = options.headers  || {};

    if (options.username && options.password) {
        options.auth = options.username + ':' + options.password;
    }

    if (isHTTPS && !options.agent && (options.pfx || options.key || options.cert)) {
        options.agent = new lib.https.Agent(options);
    }

    if (isObject(params) || Array.isArray(params)) {
        if (/GET|HEAD/.test(options.method)) {
            
            var prefix = (options.path.indexOf('?') !== -1) ? '&' : '?';
            options.path += prefix + lib.querystring.stringify(params);

        } else if (/POST|PUT|DELETE/.test(options.method)) {

            if (!options.headers['Content-Type']) {
                params = lib.querystring.stringify(params);
                options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
            } else if (options.headers['Content-Type'] === 'application/json') {
                params = JSON.stringify(params);
            }

            if (typeof params === 'string') {
                options.headers['Content-Length'] = params.length;
            }
        }
    }

    var client = isHTTPS ? lib.https : lib.http;
    var req = client.request(options, function (res) {
        parseSocketBody(res, function (err, body) {
            callback(err, {
                status: { 
                    code: res.statusCode, 
                    message: res.statusMessage 
                }, 
                headers: res.headers, 
                body: body 
            });
        });
    });

    req.on('err', function (err) {
        callback(err, { status: {}, headers: {}, body: '' });
    });

    if (/POST|PUT|DELETE/.test(options.method) && typeof params === 'string') {
        req.write(params);
    }

    req.end();
}


//
// Generic request/response socket body parser.
//
function parseSocketBody(socket, callback, options) {
    options = options || {};

    var sizeLimit = options.sizeLimit || MAX_SOCKET_DATA_SIZE;
    var body = '';

    socket.on('data', function (chunk) {
        body += chunk;

        if (body.length > sizeLimit) {
            callback({ error: 'Socket size limit reached.' });
        }
    });

    socket.on('error', function (err) {
        callback(err, body);
    });

    socket.on('end', function () {
        callback(null, body);
    });
}


//
// Check if variable is a valid object.
//
function isObject(obj) {
    return Object.prototype.toString.call(obj) === '[object Object]';
}


//
// Check if variable is a valid function.
//
function isFunction(obj) {
    return typeof obj === 'function';
}