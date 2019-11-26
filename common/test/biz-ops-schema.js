// stub out biz-ops-schea in tests
// eslint-disable-next-line global-require
const schemaInstance = require('@financial-times/tc-schema-sdk');
const schemaFixture = require('./fixtures/biz-ops-schema.json');

const schema = schemaInstance.init({
	// eslint-disable-next-line global-require
	schemaData: schemaFixture,
});
schema.init = () => null;

module.exports = schema;
