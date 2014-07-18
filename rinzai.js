var JSHint = require('jshint').JSHINT;
var CSSLint = require('csslint');
var domify = require('domify');
var _ = require('lodash');

var ResponseTypes = {
	LINT : 'lint',
	ERROR : 'error',
	FAILURE : 'failure',
	SUCCESS : 'success'
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
	this.messages = config.messages || {};
	this.type = config.type;
};

var HTMLQuestion = function(){
	Question.apply(this, arguments);
};

HTMLQuestion.prototype.answer = function(content){
	var nodes;
	
	try {
		nodes = domify(content);
	} catch(e) {
		return new Response(
			ResponseTypes.ERROR, 
			this.messages[ResponseTypes.ERROR],
			[
				new RinzaiError('HTML Parse Error', null, null)
			]
		);
	}
	
	try {
		this.test(nodes);
	} catch(e) {
		return new Response(
			ResponseTypes.FAILURE,
			this.messages[ResponseTypes.FAILURE],
			[
				new RinzaiError(e.message, null, null)
			]
		);
	}
	
	return new Response(
		ResponseTypes.SUCCESS,
		this.messages[ResponseTypes.SUCCESS]
	);
};

var JSQuestion = function(){
	Question.apply(this, arguments);
};

JSQuestion.prototype.ask = function(content){
	JSHint(content, this.options.jshint);
	if(JSHint.errors.length){
		var errors = [];
		JSHint.errors.forEach(function(err){
			errors.push(new RinzaiError(err.reason, err.line - 1, err.char - 1));
		});
		return new Response(
			ResponseTypes.LINT,
			this.messages[ResponseTypes.LINT],
			errors
		);
	}
	try {
		this.test(content);
	} catch(e){
		var firstStack = e.stack.split('\n')[1];
		if(firstStack.indexOf('eval') > -1){
			var position = firstStack.match(/(\d+)\:(\d+)\)$/);
			return new Response(
				ResponseTypes.ERROR,
				this.messages[ResponseTypes.ERROR],
				[
					new RinzaiError(e.message, parseInt(position[1], 10), parseInt(position[2], 10))
				]
			);
		} else {
			return new Response(
				ResponseTypes.FAILURE,
				this.messages[ResponseTypes.FAILURE],
				[
					new RinzaiError(e.message, null, null)
				]
			);
		}
	}
	return new Response(
		ResponseTypes.SUCCESS,
		this.messages[ResponseTypes.SUCCESS]
	);
};

var CSSQuestion = function(config){
	this.test = config.test;
};

CSSQuestion.prototype.ask = function(content){
	
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
};

module.exports = Rinzai;
