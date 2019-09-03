const {
	isStringNotEmpty,
	isArrayOfStrings,
	rxArrayFromStringArray,
	coerceValue,
} = require('../../lib/type-helpers');

const { GITHUB_WEBHOOK_FAIL_MODE: defaultFailureMode = 'any' } = process.env;

class AppConfig {
	constructor({
		disabled = false,
		failOn = 'any',
		updateOnMerge = false,
		updateBranch = 'master',
		systemCodes = [],
		exclude = [],
		excludeFromUpdate = [],
	} = {}) {
		const config = {
			updateOnMerge,
			disabled: !!disabled,
			failOn: coerceValue(
				failOn,
				['any', 'all', 'none'],
				defaultFailureMode,
			),
		};

		if (updateOnMerge) {
			if (isStringNotEmpty(updateBranch)) {
				config.updateBranch = updateBranch;
			}
			if (isArrayOfStrings(excludeFromUpdate)) {
				config.excludeFromUpdate = rxArrayFromStringArray(
					excludeFromUpdate,
				);
			}
		}

		if (isArrayOfStrings(exclude)) {
			config.exclude = rxArrayFromStringArray(exclude);
		}

		try {
			if (systemCodes) {
				config.systemCodes = config.systemCodes || {};
				for (const [key, value] of Object.entries(systemCodes)) {
					config.systemCodes[key] = value.toLowerCase();
				}
			}
		} finally {
			Object.assign(this, config);
		}
	}

	getMappedSystemCode(path) {
		const lowerCasePath = path.toLowerCase();
		return this.systemCodes
			? Object.keys(this.systemCodes).find(
					code => lowerCasePath === this.systemCodes[code],
			  )
			: null;
	}

	isPathExcluded(path, exclusionKey = 'exclude') {
		return (
			this[exclusionKey] &&
			this[exclusionKey].some(exclusion => exclusion.test(path))
		);
	}

	isWriteToBizOpsEnabled(branch, path) {
		if (!this.updateOnMerge) {
			return false;
		}
		if (branch !== this.updateBranch) {
			return false;
		}
		if (this.isPathExcluded(path, 'excludeFromUpdate')) {
			return false;
		}
		return true;
	}
}

exports.AppConfig = AppConfig;
