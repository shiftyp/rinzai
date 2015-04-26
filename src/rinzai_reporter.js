function RinzaiReporter() {
	this.completeListeners = [];

	this.started = false;
	this.finished = false;

	this.currentSuite = null;

	this.suites = {};
	this.specs = {};
	this.failures = [];
}

RinzaiReporter.prototype.attachCompleteListener = function(cb) {
	this.completeListeners.push(cb);
};

RinzaiReporter.prototype.extendSuite = function(suite) {
		this.suites[suite.id] = _.extend(this.suites[suite.id] || {}, suite);
};

RinzaiReporter.prototype.getSuite = function(suite) {
		this.extendSuite(suite);
		return this.suites[suite.id];
};

RinzaiReporter.prototype.extendSpec = function(spec) {
	this.specs[spec.id] = _.extend(this.specs[spec.id] || {}, spec);
};

RinzaiReporter.prototype.getSpec = function(spec) {
	this.extendSpec(spec);
	return this.specs[spec.id];
};

RinzaiReporter.prototype.jasmineStarted = function(summary) {
	this.started = true;
};

RinzaiReporter.prototype.suiteStarted = function(suite) {
	this.currentSuite = this.getSuite(suite);
};

RinzaiReporter.prototype.specStarted = function(spec) {
	spec = this.getSpec(spec);
	spec._suite = this.currentSuite;
};

RinzaiReporter.prototype.specDone = function(spec) {
	spec = this.getSpec(spec);
	if (spec.status === 'failed') {
		for (var i = 0, error; i < spec.failedExpectations.length; i++) {
			error = spec.failedExpectations[i];
			this.failures.push({name: spec.fullName, error: error});
		}
	}
};

RinzaiReporter.prototype.suiteDone = function(suite) {
	this.extendSuite(suite);
};

RinzaiReporter.prototype.jasmineDone = function() {
	this.finished = true;
	
	for (var i = 0; i < this.completeListeners.length; i++) {
		var cb = this.completeListeners[i];

		if (this.failures.length) cb(failures);
		else cb();
	}
};

module.exports = RinzaiReporter;
