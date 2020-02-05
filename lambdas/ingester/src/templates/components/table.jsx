const { h } = require('hyperons');

const List = ({ itemArray }) => itemArray.map(({ code }) => <li>{code}</li>);

const Cell = ({ contents, props = {} }) => {
	if (Array.isArray(contents)) {
		return (
			<td {...props}>
				<List itemArray={contents} />
			</td>
		);
	}
	if (contents.props && contents.value) {
		return <Cell contents={contents.value} props={contents.props} />;
	}
	if (typeof contents === 'string') {
		return <td {...props}>{contents}</td>;
	}
	if (typeof contents === 'boolean') {
		return <td {...props}>{contents ? 'Yes' : 'No'}</td>;
	}
	return <td {...props}>{JSON.stringify(contents)}</td>;
};

exports.Table = ({ caption, columns, rows }) => {
	return (
		<table
			className="o-table o-table--horizontal-lines with-margin-bottom"
			data-o-component="o-table"
		>
			<caption className="o-table__caption">
				<h3 className="o-typography-heading-level-3">{caption}</h3>
			</caption>
			{columns && columns.length && (
				<thead>
					<tr>
						{columns.map(column =>
							column.props && column.value ? (
								<th {...column.props}>{column.value}</th>
							) : (
								<th scope="col" role="columnheader">
									{column}
								</th>
							),
						)}
					</tr>
				</thead>
			)}
			{rows && rows.length && (
				<tbody>
					{rows.map(row => (
						<tr>
							{row.map(cell => (
								<Cell contents={cell} />
							))}
						</tr>
					))}
				</tbody>
			)}
		</table>
	);
};
