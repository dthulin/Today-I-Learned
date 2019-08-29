/*
Mapping is one of my favorite ways of avoiding nested For loops. There are several MAPs in this example that deal with using
emails to find accounts with transactions and their associated orders. In this example we are parsing emails from an external
system that is sending account change details to an inbox prior to the build out of an API, and exporting them into a CSV for
an ops team so they can review how it will affect orders that will be shipped. (Once a data transfer is complete a better
solution would be API and/or webhooks, but this was the use case... kind of... it's been modified drastically from my
original code and use case to protect trade secrets).

It's tempting for a new programmer to approach this type of problem with a lot of nested For loops. When all you know how to
use is a hammer, everything you see is a nail, after all. But with the quantity of data that this was built for it would take
several minutes to process that way. The use of MAPs here reduces that time down to a matter of seconds. MAPs are pretty
standard data structures in many strongly typed languages but they took a while to get to javascript.

Note the term "Map" in javascript can be used to reference 2 seperate things:

First, there's the funciton Array.prototype.map():
https://developer.mozilla.org/en-US/docs/web/javascript/reference/global_objects/array/map
This is a useful function, but not what the type of "MAP" I'm addressing here.

Secondly, there's the Map Object:
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map
The Map Object has a lot of benefits, but that doesn't mean that JSON based maps aren't without their benefits. See the
following medium article for a really good comparison of the two:
https://medium.com/front-end-weekly/es6-map-vs-object-what-and-when-b80621932373

Regardless, though there is a case to be made for implementing the Map Object in the below code, I opted for the old basic
JSON based mapping method instead. Why? First, it's how I originally wrote it before I knew about the Map Object (Remember
what I said about the hammer and nail? Lesson here: Before you begin hammering on a new problem, double check to see if
there's a new tool you can add to your belt first!). Second, I feel it's somewhat easier to demonstrate the concept of
mapping to the uninitiated by using the JSON structure which the programmer is probably more familiar with. Lastly, it
demonstrates how, even in a language where a Map Object has not yet been added to the framework (they're rare, but still out
there. I'm looking at you, AutoIT https://www.autoitscript.com/forum/topic/178187-maps-101-all-you-need-to-know-about-them/
where, last I checked, they're still in beta), with a little bit of ingenuity you should be able to find a way to make a
makeshift map anyway. Even if the preformance isn't as optimal as it would be with a MAP Object specifically designed for
the task, it's still going to be much better than a bunch of nested for loops.
*/

let env = require('./env');
let orders = require('./tables/orders.json');
let order_to_transaction = require('./tables/order_to_transaction.json');
let account_to_transaction = require('./tables/account_to_transaction.json');

let ordersMAP = {};
let order_to_transactionMAP = {};
let account_to_transactionMAP = {};

orders.forEach(order => {
    ordersMAP[order.order_id] = order;
});
order_to_transaction.forEach(transaction => {
    order_to_transactionMAP[transaction.transaction_id] = transaction.order_id;
});
account_to_transaction.forEach(transaction => {
    let order = ordersMAP[order_to_transactionMAP[transaction.transaction_id]];
    let orderDesc1 = order ? order.order_desc_1 : 'NOT FOUND';
    let orderDesc2 = order ? order.order_desc_2 : 'NOT FOUND';
    account_to_transactionMAP[transaction.account_id] = upsertToArray(account_to_transactionMAP[transaction.account_id], {
        data: transaction,
        orderDesc1: orderDesc1,
        orderDesc2: orderDesc2
    });
});

getEmails('https://api.EMAILSERVER.net/emails?mailbox=11111&query=(subject:"edited account details")');

function upsertToArray(array,item) {
    if (array && Array.isArray(array) && array.length > 0) array.push(item);
    else array = [item];
    return array;
}

function getEmails(url) {
    let options = {
        method: 'GET',
        url: url,
        json: true,
        headers:{
            Authorization: 'Bearer '+ env.EMAIL_TOKEN
        }
    };
    request(options, async (err, res, body) => {
        if (err) {
            console.log('Error!', err);
            // Handle Error
        } else {
            let allNotifications = [];
            let notificationIndicesMap = {};
            let csv = 'timestamp,date,accountId,transactionId,orderDesc1,orderDesc2,before_first_name,before_last_name,before_email,before_preferred_name,before_phone_number,before_address_line_1,before_address_line_2,before_city,before_state,before_zip_code,after_first_name,after_last_name,after_email,after_preferred_name,after_phone_number,after_address_line_1,after_address_line_2,after_city,after_state,after_zip_code\n';

            let emails = body.emails.reverse(); // Prefer to work oldest to newest.
            allEmails.forEach((email,emailIndex) => {
                let data = getBracketedSubstring(email.body,'at production web from the following data:</div>\n<div>','</div>\n</div>\n<hr /><img src="https://');
                let notification = JSON.parse(data);
                allNotifications.push(notification);
                console.log(emailIndex, email.id);
                if (notificationIndicesMap[notification.accountData.accountId]) {
                    notificationIndicesMap[notification.accountData.accountId].push(emailIndex);
                } else {
                    notificationIndicesMap[notification.accountData.accountId] = [emailIndex];
                }
            });
            
            allNotifications.forEach((notification,notificationIndex) => {
                let minNotificationIndex = Math.min(...notificationIndicesMap[notification.accountData.accountId]);
                if(Math.max(...notificationIndicesMap[notification.accountData.accountId]) === notificationIndex) {
                    let oldestNotification = allNotifications[minNotificationIndex];
                    let before = oldestNotification.accountData.accountPatchBefore;
                    let after = notification.accountData.accountPatchAfter;
                    if(account_to_transactionMAP[notification.accountData.accountId]) {
                        account_to_transactionMAP[notification.accountData.accountId].forEach((transaction) => {
                            csv += notification.nowTimestamp + ',';
                            csv += '"' + new Date( notification.nowTimestamp ).toISOString() + '",';
                            csv += notification.accountData.accountId + ',';
                            csv += '"' + transaction.data.transaction_id + '",';
                            csv += '"' + transaction.orderDesc1 + '",';
                            csv += '"' + transaction.orderDesc2 + '",';

                            csv += before.first_name ? '"' + before.first_name.replace(/"/g, '""') + '",': ',';
                            csv += before.last_name ? '"' + before.last_name.replace(/"/g, '""') + '",': ',';
                            csv += before.email ? '"' + before.email.replace(/"/g, '""') + '",': ',';
                            csv += before.preferred_name ? '"' + before.preferred_name.replace(/"/g, '""') + '",': ',';
                            csv += before.phone_number ? '"' + before.phone_number.replace(/"/g, '""') + '",': ',';
                            csv += before.address_line_1 ? '"' + before.address_line_1.replace(/"/g, '""') + '",': ',';
                            csv += before.address_line_2 ? '"' + before.address_line_2.replace(/"/g, '""') + '",': ',';
                            csv += before.city ? '"' + before.city.replace(/"/g, '""') + '",': ',';
                            csv += before.state ? '"' + before.state.replace(/"/g, '""') + '",': ',';
                            csv += before.zip_code ? '"' + before.zip_code.replace(/"/g, '""') + '",': ',';

                            csv += after.first_name ? '"' + after.first_name.replace(/"/g, '""') + '",': ',';
                            csv += after.last_name ? '"' + after.last_name.replace(/"/g, '""') + '",': ',';
                            csv += after.email ? '"' + after.email.replace(/"/g, '""') + '",': ',';
                            csv += after.preferred_name ? '"' + after.preferred_name.replace(/"/g, '""') + '",': ',';
                            csv += after.phone_number ? '"' + after.phone_number.replace(/"/g, '""') + '",': ',';
                            csv += after.address_line_1 ? '"' + after.address_line_1.replace(/"/g, '""') + '",': ',';
                            csv += after.address_line_2 ? '"' + after.address_line_2.replace(/"/g, '""') + '",': ',';
                            csv += after.city ? '"' + after.city.replace(/"/g, '""') + '",': ',';
                            csv += after.state ? '"' + after.state.replace(/"/g, '""') + '",': ',';
                            csv += after.zip_code ? '"' + after.zip_code.replace(/"/g, '""') + '"\n': '\n';
                        });
                    }
                }
            });
            fs.writeFileSync('./accountChanges.csv', csv);
        }
    });
}

function getBracketedSubstring(body,startString,endString) {
    let positions = findBeginningAndEndPostions(body,startString,endString);
    return body.substring(positions[0],positions[1]);
}

function findBeginningAndEndPostions(body,startString,endString) {
    let result = [0,0];
    result[0] = body.indexOf(startString);
    result[1] = body.indexOf(endString);
    if(result[0] > 0 && result[1] > 0){
        result[0] += startString.length;
        return result;
    } else {
        return [0,0];
    }
}
