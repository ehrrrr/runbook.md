const markdownParser = require('@financial-times/tc-markdown-parser');

const blacklistPropertyNames = [
	'lastReleaseTimestamp',
	'dependentCapabilities',
	'dependentProducts',
	'dependents',
	'lastServiceReviewDate',
	'lastSOSReport',
	'piiSources',
	'recursiveDependencies',
	'recursiveDependentProducts',
	'recursiveDependents',
	'replacedBy',
	'repositories',
	'SF_ID',
	'sosTrafficLight',
	'stakeholders',
	'updatesData',
	'dataOwner',
	'gdprRetentionProcess',
	'gdprErasureProcess',
];

module.exports = markdownParser.getParser({
	type: 'System',
	blacklistPropertyNames,
});

module.exports.excludedProperties = blacklistPropertyNames;
