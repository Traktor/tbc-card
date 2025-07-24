# `tbc-card`
Node.js module for TBC card payments API.

## Usage
```
npm install tbc-card --save
```
```js
var TBC = require('tbc-card');

TBC.config({
  pfxFile: '/path/to/pfx/file',
  passphrase: 'TBC provided passphrase'
});
```

```js
// Register a transaction.

TBC.registerTransaction({
  amount: 0.1, // in Lari
  client_ip_addr: '123.123.123.123',
  description: 'Sample transaction'
}, function (err, response) {
  console.log(response.TRANSACTION_ID);
});
```

```js
// Check a transaction status.

TBC.checkTransaction({
  transaction_id: 'a-valid-TBC-transaction-id',
  client_ip_addr: '123.123.123.123'
}, function (err, response) {
  console.log(response.RESULT === 'OK');
});
```

```js
// Execute/finalize a transaction.

TBC.makeTransaction({
  transaction_id: 'a-valid-TBC-transaction-id',
  amount: 0.1, // in Lari
  client_ip_addr: '123.123.123.123',
  description: 'Sample transaction'
}, function (err, response) {
  console.log(response.RESULT === 'OK');
});
```

```js
// Cancel a transaction.

TBC.cancelTransaction({
  transaction_id: 'a-valid-TBC-transaction-id'
}, function (err, response) {
  console.log(response.RESULT === 'OK');
});
```


## Command line usage
```
npm install -g tbc-card
```
```sh
export TBC_PFX_FILE='/path/to/pfx/file'
export TBC_PASSPHRASE='TBC provided passphrase'
```
```sh
# Register a transaction.
tbc-card --action=register --ip=123.123.123.123 --amount=0.1
```
```sh
# Check a transaction.
tbc-card --action=check --ip=123.123.123.123 --tid='a-valid-TBC-transaction-id'
```
```sh
# Execute a transaction.
tbc-card --action=make --ip=123.123.123.123 --amount=0.1 --tid='a-valid-TBC-transaction-id'
```
```sh
# Cancel a transaction.
tbc-card --action=cancel --tid='a-valid-TBC-transaction-id'
```
