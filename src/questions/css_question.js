var Question = require('./question.js');
var errorTypes = require('../error_types.js');

var CSSLint = require('csslint').CSSLint;
var css = require('css');

var CSSQuestion = function() {
	Question.apply(this, arguments);
};

CSSQuestion.prototype = Object.create(Question.prototype);

CSSQuestion.prototype.answer = function (content, cb) {
	var self = this;
	var ast;
	try {
		var results = CSSLint.verify(content);
		if (results.messages.length) {
			return cb(this.generateResponse(
				results.messages.map(function (err) {
					return this.generateError(ErrorTypes.LINT, err.message, err.line, err.col);
				}, this)
			));
		}

		ast = css.parse(content);
	} catch (e) {
		return cb(this.generateResponse([this.generateError(ErrorTypes.ERROR, e.message, null, null)]));
	}
	this.runTest(content, ast, function (testFailures) {
		if (testFailures) {
			var firstFailureAdded = false;
			return cb(this.generateResponse(
				testFailures.reduce(function (ret, testFailure) {
					if (!firstFailureAdded || this.options.returnAllTestErrors) {
						firstFailureAdded = true;
						var message = testFailure.name;
						if (this.options.returnFailureMessages) {
							message += testFailure.error.message;
						}
						ret.push(this.generateError(ErrorTypes.FAILURE, message, null, null));
					}
					return ret;
				}, [], this)
			));
		}
		return cb(this.generateResponse());
	});
};

module.exports = CSSQuestion;
