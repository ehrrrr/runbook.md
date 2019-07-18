const { h } = require('hyperons');

const SingleMeter = ({ value }) => {
	const normalizedValue = Number(value).toFixed(1);
	return (
		<meter
			aria-hidden="true"
			value={normalizedValue}
			low="50"
			high="80"
			max="100"
			optimum="100"
		>
			{normalizedValue}%
		</meter>
	);
};

exports.ScoreTile = ({ value }) => (
	<div className="o-layout-item">
		<div className="o-layout-item__content">
			<div className="score-meter">
				<label htmlFor="score-meter" className="score-meter__label">
					Runbook Operability Score
				</label>
				<div className="score-meter__container">
					<SingleMeter value={value} />
					<span
						className="score-meter__value"
						style={{ left: `${value}%` }}
					>
						{value}%
					</span>
				</div>
			</div>
		</div>
	</div>
);

exports.SingleMeter = SingleMeter;
