const { decodeBase64 } = require('./type-helpers');

const parseKinesisRecord = (childLogger, logEvent) => (record = {}) => {
	const { eventSource, eventID, kinesis: { data } = {} } = record;

	const log = childLogger.child({
		eventID,
	});

	if (eventSource !== 'aws:kinesis') {
		log.info(
			{
				event: `PARSE_${logEvent}_SKIPPED`,
				record,
			},
			'Event source was not Kinesis',
		);
		return {
			eventID,
		};
	}

	let payload;
	try {
		payload = JSON.parse(decodeBase64(data));

		log.debug(
			{
				event: `PARSE_${logEvent}_SUCCESS`,
				payload,
			},
			'Received kinesis record',
		);
	} catch (error) {
		log.error(
			{
				event: `PARSE_${logEvent}_ERROR`,
				...error,
			},
			'Record parsing has failed',
		);
		return {
			eventID,
		};
	}

	return {
		...payload,
		eventID: record.eventID,
	};
};

module.exports = {
	parseKinesisRecord,
};
