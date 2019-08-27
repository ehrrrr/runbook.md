function isStringNotEmpty(str) {
	return typeof str === 'string' && str.length;
}

function isArrayNotEmpty(arr) {
	return Array.isArray(arr) && arr.length;
}

function isArrayOfStrings(arr) {
	return isArrayNotEmpty(arr) && arr.every(isStringNotEmpty);
}

function rxFromPrefixedString(str) {
	return new RegExp(
		str.slice(0, 3) === 'rx:' ? str.slice(3) : `^${str}$`,
		'i',
	);
}

function rxArrayFromStringArray(arr) {
	return arr.map(rxFromPrefixedString);
}

function coerceValue(value, acceptableValues, defaultValue) {
	return acceptableValues.includes(value) ? value : defaultValue;
}

function decodeBase64(str, encoding = 'utf8') {
	return Buffer.from(str, 'base64').toString(encoding);
}

function encodeBase64(str, encoding = 'utf8') {
	return Buffer.from(str, encoding).toString('base64');
}

function makePlural(count, word = 'runbook', termination = 's') {
	return `${count} ${count === 1 ? word : `${word}${termination}`}`;
}

function numericValue(value) {
	if ([true, false, NaN, undefined, null].includes(value)) {
		return null;
	}
	const number = Number(value);
	return Number.isNaN(number) ? null : number;
}

module.exports = {
	isStringNotEmpty,
	isArrayNotEmpty,
	isArrayOfStrings,
	rxFromPrefixedString,
	rxArrayFromStringArray,
	coerceValue,
	decodeBase64,
	encodeBase64,
	makePlural,
	numericValue,
};
