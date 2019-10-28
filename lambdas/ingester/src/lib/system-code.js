const { basename } = require('path');

const runbookRx = /runbook\.md$/i;

const getMappedSystemCode = (systemCodeMap = {}, path) => {
	const lowerCasePath = path.toLowerCase();
	return Object.keys(systemCodeMap).find(
		code => lowerCasePath === systemCodeMap[code].toLowerCase(),
	);
};

const parseSystemCode = path => {
	const parsedSystemCode = basename(path)
		.replace(runbookRx, '')
		.slice(0, -1);
	return parsedSystemCode.length ? parsedSystemCode : null;
};

// We should consider with priority of system code detection as following order:
// 1. From runbook.md content -- it will overrided on calling ingest() if exists
// 2. From .github/runbook.yml
// 3. From file name like [system-code]_runbook.md
// 4. Use Change API message's one
const detectSystemCode = (configuredSystemCodes, path, systemCode = '') => {
	return (
		getMappedSystemCode(configuredSystemCodes, path) ||
		parseSystemCode(path) ||
		systemCode
	).trim();
};

module.exports = {
	runbookRx,
	detectSystemCode,
};
