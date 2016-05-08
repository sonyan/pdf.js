exports.config = {
	framework: 'jasmine',
	seleniumAddress: 'http://localhost:4444/wd/hub',
	specs: ['spec.js'],
	multiCapabilities: [
		//{ browserName: 'firefox' 	},
		//{ browserName: 'chrome' 	},
		{ browserName: 'internet explorer'}
	],
	jasmineNodeOpts: {
		showColors: true
	},
	onPrepare: function() {
		var width = 800;
		var height = 600;
		var x = 20;
		var y = 20;
		browser.driver.manage().window().setSize(width, height);
		browser.driver.manage().window().setPosition(x, y);
	}
}