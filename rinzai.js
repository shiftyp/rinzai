var JSHint = require('jshint').JSHINT;
var CSSLint = require('csslint');
var cssparse = require('css');
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

var extend = function(a, b){
	var surrogate = function(){};
	surrogate.prototype = a.prototype;
	b.prototype = new surrogate();
};

var Response = function(type, message, errors){
	this.type = type;
	this.message = message || '';
	this.errors = errors;
};

var RinzaiError = function(message, line, char){
	this.message = message;
	this.line = line;
	this.char = char;
};

var Question = function(config, options){
	this.options = options;
	this.test = config.test;
	this.envUrl = config.envUrl;
	this.messages = config.messages || {};
	this.type = config.type;
};

Question.prototype.createEnvironment = function(cb){
	var self = this;
	this.envFrame = document.createElement('iframe');
	this.envFrame.style.position = 'absolute';
	this.envFrame.style.top = '-1000px';
	this.envFrame.style.left = '-1000px';
	document.body.appendChild(this.envFrame);
	var env = this.envFrame.contentWindow;
	if(this.envUrl){
		this.envFrame.src = this.envUrl;
		var onLoad = function(){
			self.envFrame.removeEventListener('load', onLoad);
			cb(env);
		};
		this.envFrame.addEventListener('load', onLoad);
	} else {
		cb(env);
	}
};

Question.prototype.destroyEnvironment = function(){
	if(this.envFrame){
		this.envFrame.parentNode.removeChild(this.envFrame);
	 	delete this.envFrame;
	}
};

Question.prototype.runTest = function(content, parsed, cb){
	var self = this;
	var env = this.createEnvironment(function(env){
		try {
			self.test(content, parsed, env);
		} catch(e) {
			self.destroyEnvironment();
			return cb(e);
		}
		self.destroyEnvironment();
		return cb();
	});
};

var HTMLQuestion = function(){
	Question.apply(this, arguments);
};

extend(Question, HTMLQuestion);

HTMLQuestion.prototype.answer = function(content, cb){
	var self = this;
	var nodes;
	try {
		nodes = domify(content);
	} catch(e) {
		return cb(new Response(
			ResponseTypes.ERROR, 
			this.messages[ResponseTypes.ERROR],
			[
				new RinzaiError('HTML Parse Error', null, null)
			]
		));
	}
	
	this.runTest(content, nodes, function(testErr){
		if(testErr) {
			return cb(new Response(
				ResponseTypes.FAILURE,
				self.messages[ResponseTypes.FAILURE],
				[
					new RinzaiError(testErr.message, null, null)
				]
			));
		}
		
		return cb(new Response(
			ResponseTypes.SUCCESS,
			self.messages[ResponseTypes.SUCCESS]
		));
	});
};

var JSQuestion = function(){
	Question.apply(this, arguments);
};

extend(Question, JSQuestion);

JSQuestion.prototype.answer = function(content, cb){
	var self = this;

	JSHint(content, this.options.jshint);
	if(JSHint.errors.length){
		return cb(new Response(
			ResponseTypes.LINT,
			this.messages[ResponseTypes.LINT],
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
			this.messages[ResponseTypes.STYLE],
			_.map(styleErrors.getErrorList(), function(err){
				return new RinzaiError(err.message, err.line, err.column);
			})
		));
	}

	var ast = acorn.parse(content);
	this.runTest(content, ast, function(testErr){
		if(testErr){
			var firstStack = testErr.stack.split('\n')[1];
			if(firstStack && firstStack.indexOf('eval') > -1){
				var position = firstStack.match(/(\d+)\:(\d+)\)$/);
				return cb(new Response(
					ResponseTypes.ERROR,
					self.messages[ResponseTypes.ERROR],
					[
						new RinzaiError(testErr.message, parseInt(position[1], 10), parseInt(position[2], 10))
					]
				));
			} else {
				return cb(new Response(
					ResponseTypes.FAILURE,
					self.messages[ResponseTypes.FAILURE],
					[
						new RinzaiError(testErr.message, null, null)
					]
				));
			}
		}
		return cb(new Response(
			ResponseTypes.SUCCESS,
			self.messages[ResponseTypes.SUCCESS]
		));
	});
};

var CSSQuestion = function(config){
	this.test = config.test;
};

extend(Question, CSSQuestion);

CSSQuestion.prototype.answer = function(content){
	var results = CSSLint.verify(content);
	if(results.messages.length){
		return cb(new Response(
			ResponseTypes.LINT,
			this.messages[ResponseTypes.LINT],
			_.map(results.messages, function(err){
				return new RinzaiError(err.message, err.line, err.col);
			})
		));
	}
	return cb(new Response(
		ResponseTypes.SUCCESS,
		self.messages[ResponseTypes.SUCCESS]
	));
};

var Rinzai = function(config, options){
	this.options = options || {};
	this.questions = [];
	this.questionsById = {};
	_.forEach(config.questions, this.addQuestion, this);
};

Rinzai.prototype.addQuestion = function(q){
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
