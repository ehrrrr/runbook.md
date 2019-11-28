const schema = require('@financial-times/tc-schema-sdk');
const { default: here } = require('outdent');
const runbookMd = require('..');

schema.init({
	schemaBaseUrl: process.env.SCHEMA_BASE_URL,
	updateMode: 'stale',
	logger: console,
});

const parser = runbookMd(schema);

test('a valid property name gets correctly coerced', async () => {
	const { data } = await parser.parseRunbookString(here`
		# name

		## Contains personal data
		yes
	`);

	expect(data).toHaveProperty('containsPersonalData', true);
});

test('an invalid property name prints an error', async () => {
	const { data, errors } = await parser.parseRunbookString(here`
		# name

		## Contains big monkey
		yes
	`);

	expect(errors).toHaveProperty('length', 1);
	expect(data).toEqual({
		name: 'name',
	});
});
