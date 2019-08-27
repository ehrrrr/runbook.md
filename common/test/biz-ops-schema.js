// stub out biz-ops-schea in tests
// eslint-disable-next-line global-require
const schemaInstance = require('@financial-times/biz-ops-schema/lib/get-instance');
const schemaFixture = require('./fixtures/biz-ops-schema.json');

const schema = schemaInstance.init({
	// eslint-disable-next-line global-require
	rawData: schemaFixture,
});
schema.configure({
	baseUrl: global.process.env.SCHEMA_BASE_URL,
	updateMode: 'dev',
});

module.exports = schema;
