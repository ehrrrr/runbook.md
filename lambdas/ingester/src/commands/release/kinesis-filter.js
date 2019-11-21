const filterValidRecord = childLogger => (record = {}) => {
	const {
		commit,
		eventID,
		gitRepositoryName,
		githubData: { htmlUrl: gitRefUrl } = {},
		loggerContext: { traceId } = {},
		isProdEnv,
	} = record;
	const log = childLogger.child({
		eventID,
		traceId,
	});

	if (!commit || !(gitRepositoryName || gitRefUrl)) {
		log.info(
			{ event: 'BAIL_INSUFFICIENT_DATA' },
			'Record did not contain commit and repository data',
		);
		return false;
	}

	return !!isProdEnv;
};

module.exports = { filterValidRecord };
