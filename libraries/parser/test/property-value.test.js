const schema = require('@financial-times/biz-ops-schema');
const { default: here } = require('outdent');
const runbookMd = require('..');

schema.configure({
	baseUrl: process.env.SCHEMA_BASE_URL,
	updateMode: 'stale',
	logger: console,
});

const parser = runbookMd(schema);

test('boolean types are coerced to boolean', async () => {
	const { data } = await parser.parseRunbookString(here`
		# name

		## Contains personal data
		yes

		## Contains sensitive data
		true

		## Downloadable personal data
		👍

		## Contactable individuals
		👎
	`);

	expect(data).toEqual({
		name: 'name',
		containsPersonalData: true,
		containsSensitiveData: true,
		// the headings for these are using the labels
		canDownloadPersonalData: true,
		canContactIndividuals: false,
	});
});

test('boolean fields with non-boolean contents are errors', async () => {
	const { data, errors } = await parser.parseRunbookString(here`
		# name

		## Contains personal data
		sure
	`);

	expect(data).toEqual({
		name: 'name',
	});

	expect(errors.length).toBe(1);
	expect(errors[0].message).toMatch(/\bsure\b/);
});

test('string types are coerced to string', async () => {
	const { data } = await parser.parseRunbookString(here`
		# name

		## more information

		hello

		## primary url

		hello
	`);

	expect(typeof data.moreInformation).toBe('string');
	expect(typeof data.primaryURL).toBe('string');
});

test('enums types correctly return their value', async () => {
	const { data } = await parser.parseRunbookString(here`
		# name

		## Service tier
		platinum

	`);

	expect(data.serviceTier).toBe('Platinum');
});

test('enums types with incorrect values produce error', async () => {
	const { data, errors } = await parser.parseRunbookString(here`
		# name

		## Service tier

		Cardboard
	`);

	expect(data.serviceTier).toBe(undefined);
	expect(errors.length).toBe(1);
	const [{ message }] = errors;
	expect(message).toMatch(/\bcardboard\b/);
	expect(message).toContain('ServiceTier');
});

// Before this test, we had links coming out wrapped in triangle brackets
test('urls should stay urls', async () => {
	const { data } = await parser.parseRunbookString(here`
		# name

		## primary url
		https://snoot.club
	`);

	expect(data.primaryURL).toBe('https://snoot.club');
	expect(typeof data.primaryURL).toBe('string');
});

test('nested fields are coerced to string (the code)', async () => {
	const { data } = await parser.parseRunbookString(here`
		# name

		## technical owner

		chee.rabbits
	`);

	expect(data.technicalOwner).toBe('chee.rabbits');
});

test('properties with hasMany turn bulleted lists into arrays', async () => {
	const { data, errors } = await parser.parseRunbookString(here`
		# name

		## known about by

		* chee.rabbits

		## dependencies

		* ft-app-fruitcake

		## replaces

		* ft-app-fruitcake
		* apple-quicktime
	`);

	expect(errors).toHaveLength(0);
	expect(data.knownAboutBy).toEqual(['chee.rabbits']);
	expect(data.dependencies).toEqual(['ft-app-fruitcake']);
	expect(data.replaces).toEqual(['ft-app-fruitcake', 'apple-quicktime']);
});

test('dependents is banned', async () => {
	const { data, errors } = await parser.parseRunbookString(here`
		# name

		## known about by

		* chee.rabbits

		## dependents

		* ft-app-fruitcake
	`);

	expect(errors).toHaveLength(1);
	expect(data.knownAboutBy).toEqual(['chee.rabbits']);
	const [{ message }] = errors;
	expect(message).toEqual(
		'dependents is not permitted within runbook.md (to allow other people to edit it)',
	);
});

test('properties with hasMany must be bulleted lists', async () => {
	const { errors } = await parser.parseRunbookString(here`
		# name

		## known about by

		chee.rabbits
	`);

	expect(errors).toHaveLength(1);

	const [{ message }] = errors;
	expect(message).toContain('list');
	expect(message).toContain('bullet');
});

test('properties without hasMany must not be bulleted lists', async () => {
	const { errors } = await parser.parseRunbookString(here`
		# name

		## primary url

		* https://ft.com
	`);

	expect(errors).toHaveLength(1);

	const [{ message }] = errors;
	expect(message).toContain('list');
	expect(message).toContain('bullet');
});

test('subdocuments have their headers reduced two levels', async () => {
	const { data } = await parser.parseRunbookString(here`
		# name

		## more information

		### hello
	`);

	expect(data).toEqual({
		name: 'name',
		moreInformation: '# hello',
	});
});

test('last review date is banned', async () => {
	const { errors } = await parser.parseRunbookString(here`
		# name

		## last review date

		July 21 2018
	`);

	expect(errors).toHaveLength(1);
	const [{ message }] = errors;
	expect(message).toEqual(
		'lastServiceReviewDate is not permitted within runbook.md (to allow other people to edit it)',
	);
});
// There are currently no date fields permitted in runbook.md; lastServiceReviewDate is reserved for Ops manual entry
test.skip('date fields are coerced to iso strings', async () => {
	const naiveJavaScriptIsoStringRegex = /^\d{4}(?:-\d{2}){2}T(?:\d{2}:){2}\d{2}\.\d{3}Z$/;
	const { data } = await parser.parseRunbookString(here`
		# name

		## last review date

		July 21 2018
	`);

	expect(data.lastServiceReviewDate).toMatch(naiveJavaScriptIsoStringRegex);
});

test.skip('date fields keep the correct date', async () => {
	const { data } = await parser.parseRunbookString(here`
		# name

		## last review date

		1965-09-17
	`);

	const date = new Date(data.lastServiceReviewDate);

	// gotta go fast
	expect(date.getFullYear()).toBe(1965);
	expect(date.getMonth()).toBe(8);
	expect(date.getDate()).toBe(17);
});

test('date fields with bad dates are an error', async () => {
	const { errors } = await parser.parseRunbookString(here`
		# name

		## last review date

		mario's birthday
	`);

	expect(errors).toHaveLength(1);

	const [{ message }] = errors;

	expect(message).toContain("mario's birthday");
	expect(message).toContain('Date');
});

test('empty sections are an error', async () => {
	const { data, errors } = await parser.parseRunbookString(here`
		# name

		## Contains personal data

		## dependents

		## more information

		neat
	`);

	expect(data).toEqual({
		name: 'name',
		moreInformation: 'neat',
	});

	expect(errors).toEqual([
		{
			line: 3,
			message: 'property "containsPersonalData" has no value',
		},
		{
			line: 5,
			message: 'property "dependents" has no value',
		},
	]);
});
