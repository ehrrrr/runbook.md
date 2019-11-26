const bizOpsSchema = require('@financial-times/tc-schema-sdk');
const logger = require('@financial-times/lambda-logger');

bizOpsSchema.init({
	schemaBaseUrl: process.env.SCHEMA_BASE_URL,
	updateMode: 'stale',
	logger,
});

module.exports = bizOpsSchema;
