var JSHint = require('jshint').JSHINT;
var CSSLint = require('csslint').CSSLint;
var css = require('css');
var acorn = require('acorn');		
var domify = require('domify');
var JscsStringChecker = require('jscs/lib/string-checker.js');
var jRequire = require('jasmine-core/lib/jasmine-core/jasmine');
var jasmine = jRequire.core(jRequire);
var _ = require('lodash');

var ErrorTypes = {
	LINT : 'lint',
	STYLE : 'style',
	ERROR : 'error',
	FAILURE : 'failure'
};

var extend = function (a, b) {
	var surrogate = function(){};
	surrogate.prototype = a.prototype;
	b.prototype = new surrogate();
};

var Response = function (errors) {
	this.errors = errors;
};

var RinzaiError = function (type, message, line, char) {
	this.type = type;
	this.message = message;
	this.line = line;
	this.char = char;
};

var RinzaiReporter = function (cb) {
	var self = this;
	self.started = false;
	self.finished = false;

	var currentSuite = null;

	var __suites = {};
	var	__specs = {};
	var failures = [];
	function getSuite(suite) {
		__suites[suite.id] = _.extend(__suites[suite.id] || {}, suite);
		return __suites[suite.id];
	}
	function getSpec(spec) {
		__specs[spec.id] = _.extend(__specs[spec.id] || {}, spec);
		return __specs[spec.id];
	}

	self.jasmineStarted = function(summary) {
		self.started = true;
	};
	self.suiteStarted = function(suite) {
		suite = getSuite(suite);
		currentSuite = suite;
	};
	self.specStarted = function(spec) {
		spec = getSpec(spec);
		spec._suite = currentSuite;
	};
	self.specDone = function(spec) {
		spec = getSpec(spec);
		if (spec.status === 'failed') {
			for (var i = 0, error; i < spec.failedExpectations.length; i++) {
				error = spec.failedExpectations[i];
				failures.push({name: spec.fullName, error: error});
			}
		}
	};
	self.suiteDone = function(suite) {
		suite = getSuite(suite);
	};
	self.jasmineDone = function() {
		self.finished = true;
		
		if (failures.length)
			cb(failures);
		else
			cb();
	};
};

var Question = function (config, options) {
	this.options = options;
	this.test = config.test;
	this.envUrl = config.envUrl;
	this.type = config.type;
};

Question.prototype.createFrame = function(cb){
	var self = this;
	if(!this.envFrames) this.envFrames = [];
	var envFrame = document.createElement('iframe');
	envFrame.style.position = 'absolute';
	envFrame.style.top = '-1000px';
	envFrame.style.left = '-1000px';
	document.body.appendChild(envFrame);
	this.envFrames.push(envFrame);
	var env = envFrame.contentWindow;
	if(this.envUrl){
		envFrame.src = this.envUrl;
		var onLoad = function(){
			envFrame.removeEventListener('load', onLoad);
			cb(env);
		};
		envFrame.addEventListener('load', onLoad);
	} else {
		cb(env);
	}
};

Question.prototype.destroyFrames = function(){
	if(this.envFrames){
		_.forEach(this.envFrames, function(envFrame){
			envFrame.parentNode.removeChild(envFrame);
		});
	 	delete this.envFrames;
	}
};

Question.prototype.runTest = function(content, parsed, cb){
	var self = this;
	var run;
	var frameFactory = _.bindKey(this, 'createFrame');
	var testEnv = new jasmine.Env();

	var done = function(errs){
		self.destroyFrames();
		if (errs) {
			cb(errs);
		} else {
			cb();
		}
	};

	var reporter = new RinzaiReporter(done);
	testEnv.addReporter(reporter);

	self.test(testEnv, content, parsed, frameFactory);
	
	testEnv.execute();
};

var HTMLQuestion = function(){
	Question.apply(this, arguments);
};

extend(Question, HTMLQuestion);

HTMLQuestion.prototype.answer = function(content, cb){
	var self = this;
	var parser = new DOMParser();
	var node;

	try {
		var parseErrors = this.validate(content);
		if (parseErrors.length){
			return cb(new Response(parseErrors));
		}
		node = domify(content);
	} catch(e) {
		return cb(new Response([
			new RinzaiError(ErrorTypes.ERROR, e.message, null, null)
		]));
	}
	
	var nodes = [];
	if (node instanceof DocumentFragment){
		nodes = _.toArray(node.querySelectorAll('*'));
	} else {
		nodes = [node];
	}
	this.runTest(content, nodes, function(testFailures){
		if(testFailures) {
			var firstFailureAdded = false;
			return cb(new Response(
				_.reduce(testFailures, function (ret, testFailure) {
					if (!firstFailureAdded || self.options.returnAllTestErrors) {
						firstFailureAdded = true;
						var message = testFailure.name;
						if (self.options.returnErrorMessages) {
							message += ' : ' + testFailure.error.message;
						}
						ret.push(new RinzaiError(ErrorTypes.FAILURE, message, null, null));
					}
					return ret;
				}, [])
			));
		}
		
		return cb(new Response());
	});
};

HTMLQuestion.prototype.validate = function(html){
	var parser = new DOMParser();
	var d = parser.parseFromString('<?xml version="1.0"?><html>\n' + html + '\n</html>','text/xml');
	var errors = [];
	if (d.querySelector('parsererror')) {
		errors = _.map(d.querySelectorAll('parsererror > div'), function(node){
			var errorText = node.textContent;
			var matches = errorText.match(/error on line (\d+) at column (\d+)\:\s(.+)/);
			return new RinzaiError(ErrorTypes.LINT, matches[3], parseInt(matches[1], 10) - 1, parseInt(matches[2], 10));
		});
	} else {
			d = parser.parseFromString(html, 'text/html');
			allnodes = d.getElementsByTagName('*');
			for (var i=allnodes.length-1; i>=0; i--) {
					if (allnodes[i] instanceof HTMLUnknownElement){
						errors.push(new RinzaiError(ErrorTypes.LINT, 'Unknown HTML element: ' + allnodes[i].tagName, null, null));
					}
			}
	}
	return errors;
};

var JSQuestion = function(){
	Question.apply(this, arguments);
};

extend(Question, JSQuestion);

JSQuestion.prototype.answer = function(content, cb){
	var self = this;
	var ast;
	try {
		JSHint(content, this.options.jshint);
		if(JSHint.errors.length){
			return cb(new Response(
				_.map(JSHint.errors, function(err){
					return new RinzaiError(ErrorTypes.LINT, err.reason, err.line);
				})
			));
		}

		var checker = new JscsStringChecker();
		checker.registerDefaultRules();
		checker.configure(this.options.jscs || {});
		var styleErrors = checker.checkString(content);
		if(styleErrors.getErrorList().length){
			return cb(new Response(
				_.map(styleErrors.getErrorList(), function(err){
					return new RinzaiError(ErrorTypes.STYLE, err.message, err.line, err.column);
				})
			));
		}

		ast = acorn.parse(content);
	} catch (e) {
		return cb(new Response(
			[new RinzaiError(ErrorTypes.ERROR, e.message, null, null)]
		));
	}

	this.runTest(content, ast, function(testFailures){
		if(testFailures){
			var firstFailureAdded = false;
			var errors = _.reduce(testFailures, function(ret, testFailure){
				if(!firstFailureAdded || self.options.returnAllTestErrors){
					firstFailureAdded = true;
					var testError = testFailure.error;
					var firstStack = testError.stack.split('\n')[1];
					if(firstStack && firstStack.indexOf('eval') > -1){
						var position = firstStack.match(/(\d+)\:(\d+)\)$/);
						ret.push(new RinzaiError(
							ErrorTypes.ERROR, 
							testError.message, 
							parseInt(position[1], 10), 
							parseInt(position[2], 10)
						));
					} else {
						var message = testFailure.name;
						if (self.options.returnFailureMessages) {
							ret += ' : ' + testError.message;
						}
						ret.push(new RinzaiError(ErrorTypes.FAILURE,  message, null, null));
					}
				}
				return ret;
			}, []);
			return cb(new Response(errors));
		}
		return cb(new Response());
	});
};

var CSSQuestion = function(){
	Question.apply(this, arguments);
};

extend(Question, CSSQuestion);

CSSQuestion.prototype.answer = function (content, cb) {
	var self = this;
	var ast;
	try {
		var results = CSSLint.verify(content);
		if(results.messages.length){
			return cb(new Response(
				_.map(results.messages, function (err) {
					return new RinzaiError(ErrorTypes.LINT, err.message, err.line, err.col);
				})
			));
		}

		ast = css.parse(content);
	} catch (e) {
		return cb(new Response([new RinzaiError(ErrorTypes.ERROR, e.message, null, null)]));
	}
	this.runTest(content, ast, function (testFailures) {
		if(testFailures){
			var firstFailureAdded = false;
			return cb(new Response(
				_.reduce(testFailures, function (ret, testFailure) {
					if (!firstFailureAdded || self.options.returnAllTestErrors) {
						firstFailureAdded = true;
						var message = testFailure.name;
						if (self.options.returnFailureMessages) {
							message += testFailure.error.message;
						}
						ret.push(new RinzaiError(ErrorTypes.FAILURE, message, null, null));
					}
					return ret;
				}, [])
			));
		}
		return cb(new Response());
	});
};

var Rinzai = function (questions, options) {
	this.options = options || {};
	this.questions = [];
	this.questionsById = {};
	_.forEach(questions, this.addQuestion, this);
};

Rinzai.prototype.addQuestion = function (q) {
	var question;
	switch(q.type){
		case 'html':
			question = new HTMLQuestion(q, this.options);
			break;
		case 'javascript':
			question = new JSQuestion(q, this.options);
			break;
		case 'css':
			question = new CSSQuestion(q, this.options);
			break;
		default:
			throw new Error('Question type is unknown or undefined');
	}
	this.questions.push(question);
	this.questionsById[q.id] = question;
	return question;
};

module.exports = Rinzai;
