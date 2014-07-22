var JSHint = require('jshint').JSHINT;
var CSSLint = require('csslint').CSSLint;
var css = require('css');
var acorn = require('acorn');		
var domify = require('domify');
var JscsStringChecker = require('jscs/lib/string-checker.js');
var _ = require('lodash');

var ResponseTypes = {
	LINT : 'lint',
	STYLE : 'style',
	ERROR : 'error',
	FAILURE : 'failure',
	SUCCESS : 'success'
};

var extend = function (a, b) {
	var surrogate = function(){};
	surrogate.prototype = a.prototype;
	b.prototype = new surrogate();
};

var Response = function (type, errors) {
	this.type = type;
	this.errors = errors;
};

var RinzaiError = function (message, line, char) {
	this.message = message;
	this.line = line;
	this.char = char;
};

var Run = function (fn, done, timeout) {
	this.fn = fn;
	this.done = done;
	this.timeout = timeout;
};

var Question = function (config, options, runner) {
	this.options = options;
	this.test = config.test;
	this.envUrl = config.envUrl;
	this.messages = config.messages || {};
	this.type = config.type;
	this.runner = runner;
	this.async = this.test.length === 4;
	this.timeout = options.timeout || 500;
};

Question.prototype.createEnvironment = function(cb){
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

Question.prototype.destroyEnvironments = function(){
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
	var envFactory = _.bindKey(this, 'createEnvironment');

	var done = function(err){
		self.destroyEnvironments();
		if (err) {
			cb(err);
		} else {
			cb();
		}
		self.runner.dequeue();
	};

	var fn = function(){
		try {
			if (self.async) {
				self.test(content, parsed, envFactory, done);
			} else {
				self.text(content, parsed, envFactory);
			}
		} catch(e) {
			done(e);
		}
		if (!self.async) {
			done();
		}
	};

	if (this.async) {
		run = new Run(fn, done, this.timeout);
	} else {
		run = new Run(fn);
	}

	this.runner.queue(run);
};

var HTMLQuestion = function(){
	Question.apply(this, arguments);
};

extend(Question, HTMLQuestion);

HTMLQuestion.prototype.answer = function(content, cb){
	var self = this;
	var parser = new DOMParser();

	try {
		var parseErrors = this.validate(content);
		if (parseErrors.length){
			return cb(new Response(ResponseTypes.LINT, parseErrors));
		}
	} catch(e) {
		return cb(new Response(ResponseTypes.ERROR, [
			new RinzaiError(e.message, null, null)
		]));
	}
	
	var node = domify(content);
	var nodes = [];
	if (node instanceof DocumentFragment){
		nodes = _.toArray(node.querySelectorAll('*'));
	} else {
		nodes = [node];
	}
	this.runTest(content, nodes, function(testErr){
		if(testErr) {
			return cb(new Response(
				ResponseTypes.FAILURE,
				[
					new RinzaiError(testErr.message, null, null)
				]
			));
		}
		
		return cb(new Response(
			ResponseTypes.SUCCESS
		));
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
			return new RinzaiError(matches[3], parseInt(matches[1], 10) - 1, parseInt(matches[2], 10));
		});
	} else {
			d = parser.parseFromString(html, 'text/html');
			allnodes = d.getElementsByTagName('*');
			for (var i=allnodes.length-1; i>=0; i--) {
					if (allnodes[i] instanceof HTMLUnknownElement){
						errors.push(new RinzaiError('Unknown HTML element: ' + allnodes[i].tagName, null, null));
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
				ResponseTypes.LINT,
				_.map(JSHint.errors, function(err){
					return new RinzaiError(err.reason, err.line);
				})
			));
		}

		var checker = new JscsStringChecker();
		checker.registerDefaultRules();
		checker.configure(this.options.jscs || {});
		var styleErrors = checker.checkString(content);
		if(styleErrors.getErrorList().length){
			return cb(new Response(
				ResponseTypes.STYLE,
				_.map(styleErrors.getErrorList(), function(err){
					return new RinzaiError(err.message, err.line, err.column);
				})
			));
		}

		ast = acorn.parse(content);
	} catch (e) {
		return cb(new Response(
			ResponseTypes.ERROR,
			[new RinzaiError(e.message, null, null)]
		));
	}

	this.runTest(content, ast, function(testErr){
		if(testErr){
			var firstStack = testErr.stack.split('\n')[1];
			if(firstStack && firstStack.indexOf('eval') > -1){
				var position = firstStack.match(/(\d+)\:(\d+)\)$/);
				return cb(new Response(
					ResponseTypes.ERROR,
					[new RinzaiError(testErr.message, parseInt(position[1], 10), parseInt(position[2], 10))]
				));
			} else {
				return cb(new Response(
					ResponseTypes.FAILURE,
					[new RinzaiError(testErr.message, null, null)]
				));
			}
		}
		return cb(new Response(
			ResponseTypes.SUCCESS
		));
	});
};

var CSSQuestion = function(){
	Question.apply(this, arguments);
};

extend(Question, CSSQuestion);

CSSQuestion.prototype.answer = function (content, cb) {
	var results = CSSLint.verify(content);
	if(results.messages.length){
		return cb(new Response(
			ResponseTypes.LINT,
			_.map(results.messages, function (err) {
				return new RinzaiError(err.message, err.line, err.col);
			})
		));
	}

	var ast = css.parse(content);
	this.runTest(content, ast, function (testErr) {
		if(testErr){
			return cb(new Response(
				ResponseTypes.FAILURE,
				[
					new RinzaiError(testErr.message, null, null)
				]
			));
		}
		return cb(new Response(
			ResponseTypes.SUCCESS
		));
	});
};

var Runner = function () {
	this.runQueue = [];
	this.running = false;
};

Runner.prototype.queue = function (run) {
	if (this.running) {
		this.runQueue.push(run);
	} else {
		this.running = true;
		this.run(run);
	}
};

Runner.prototype.dequeue = function () {
	this.removeErrorHandler();
	this.clearTimeout();
	if (this.runQueue.length) {
		this.run(this.runQueue.shift());
	} else {
		this.running = false;
	}
};

Runner.prototype.run = function (run) {
	var self = this;
	if (run.done) {
		this.addErrorHandler(run.done);
		this.setTimeout(run.done, run.timeout);		
	}
	run.fn();
};

Runner.prototype.addErrorHandler = function (handler) {
	var self = this;
	this.errorHandler = function(evt){
		self.removeErrorHandler();
		self.clearTimeout();
		handler(evt.error);
		evt.preventDefault();
	};
	window.addEventListener('error', this.errorHandler);
};

Runner.prototype.removeErrorHandler = function () {
	if(this.errorHandler) {
		window.removeEventListener('error', this.errorHandler);
		delete this.errorHandler;
	}
};

Runner.prototype.setTimeout = function (handler, timeout) {
	var self = this;
	this.runTimeout = setTimeout(function () {
		self.removeErrorHandler();
		delete self.runTimeout;
		handler(new Error('Test timed out.'));
	}, timeout);
};

Runner.prototype.clearTimeout = function () {
	if (this.runTimeout !== undefined) {
		clearTimeout(this.runTimeout);
		delete this.runTimeout;
	}
};

var Rinzai = function (config, options) {
	this.options = options || {};
	this.questions = [];
	this.questionsById = {};
	this.runner = new Runner();
	_.forEach(config.questions, this.addQuestion, this);
};

Rinzai.prototype.addQuestion = function (q) {
	var question;
	switch(q.type){
		case 'html':
			question = new HTMLQuestion(q, this.options, this.runner);
			break;
		case 'javascript':
			question = new JSQuestion(q, this.options, this.runner);
			break;
		case 'css':
			question = new CSSQuestion(q, this.options, this.runner);
			break;
		default:
			throw new Error('Question type is unknown or undefined');
	}
	this.questions.push(question);
	this.questionsById[q.id] = question;
	return question;
};

module.exports = Rinzai;
