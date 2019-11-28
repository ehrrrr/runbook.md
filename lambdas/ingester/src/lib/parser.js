const runbookMd = require('../../../../libraries/parser');
const schema = require('./get-configured-schema');

module.exports = runbookMd(schema);
