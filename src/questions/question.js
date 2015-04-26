var RinzaiError = require('../rinzai_error.js');

var jRequire = require('jasmine-core/lib/jasmine-core/jasmine');
var jasmine = jRequire.core(jRequire);

var Response = function (errors) {
	this.errors = errors;
};

var Question = function (config, options) {
	this.options = options;
	this.test = config.test;
	this.envUrl = config.envUrl;
	this.type = config.type;
};

Question.prototype.createFrame = function(cb) {
	if (!this.envFrames) this.envFrames = [];
	var envFrame = document.createElement('iframe');
	envFrame.style.position = 'absolute';
	envFrame.style.top = '-1000px';
	envFrame.style.left = '-1000px';
	document.body.appendChild(envFrame);
	this.envFrames.push(envFrame);
	var env = envFrame.contentWindow;
	if (this.envUrl) {
		envFrame.src = this.envUrl;
		var onLoad = function() {
			envFrame.removeEventListener('load', onLoad);
			cb(env);
		};
		envFrame.addEventListener('load', onLoad);
	} else {
		cb(env);
	}
};

Question.prototype.destroyFrames = function() {
	if (this.envFrames) {
		this.envFrames.forEach(function(envFrame) {
			envFrame.parentNode.removeChild(envFrame);
		});
	 	this.envFrames = null;
	}
};

Question.prototype.runTest = function(content, parsed, cb) {
	var run;
	var frameFactory = this.createFrame.bind(this);
	var testEnv = new jasmine.Env();

	var done = function(errs) {
		this.destroyFrames();

		if (errs) {
			cb(errs);
		} else {
			cb();
		}
	}.bind(this);

	var reporter = new RinzaiReporter();
	reporter.addCompleteListener(done);

	testEnv.addReporter(reporter);

	if (this.test) this.test(testEnv, content, parsed, frameFactory);
	
	testEnv.execute();
};

Question.prototype.generateResponse = function(errors) {
	return new Response(errors);
};

Question.prototype.generateError = function(type, error, line, column) {
	return new RinzaiError(type, error, line, column);
};

module.exports = Question;
