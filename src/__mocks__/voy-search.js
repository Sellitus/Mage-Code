module.exports = {
	Voy: function () {
		return {
			add: jest.fn(),
			search: jest.fn(),
			serialize: jest.fn(),
			count: jest.fn(() => 0),
		}
	},
}
