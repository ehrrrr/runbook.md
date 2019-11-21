const transformSOSResult = ({
	errorMessages: validationErrors,
	percentages: validationData,
	weightedScore,
} = {}) => ({
	validationErrors,
	validationData,
	weightedScore: Number(weightedScore).toFixed(1),
});

module.exports = {
	transformSOSResult,
};
