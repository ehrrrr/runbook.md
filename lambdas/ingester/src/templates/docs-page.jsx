// eslint-disable-next-line no-unused-vars
const { h, Fragment } = require('hyperons');

module.exports = ({ data: { content } }) => {
	return (
		<Fragment>
			<div className="o-layout__sidebar" />
			<main
				dangerouslySetInnerHTML={{ __html: content }}
				className="o-layout-typography o-layout__main"
			/>
		</Fragment>
	);
};
