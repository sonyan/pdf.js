describe('Protractor Demo App', function() {
	browser.ignoreSynchronization = true;
	browser.get('http://localhost:8888/web/viewer.html');
	browser.sleep(3000);

	var input = browser.findElement(by.id('filingentitylocation.taxnumber1_Temp1'));

	it('should have a title', function() {
		setTimeout(function() {
			expect(input.getAttribute('value')).toEqual('12345678');
		}, 3000);
	});

	it('should remove the input field when not selected', function() {
		browser
			.findElement(by.id('chkTaxNumber1.`1'))
			.click();

		browser.sleep(1000);
		var style = input.getAttribute('style');
		expect(style).toContain('display: none');
	});
});