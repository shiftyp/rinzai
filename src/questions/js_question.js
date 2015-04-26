var Question = require('./question.js');
var errorTypes = require('../error_types.js');

var JSHint = require('jshint').JSHINT;
var acorn = require('acorn');		
var JscsStringChecker = require('jscs/lib/string-checker.js');

var JSQuestion = function() {
	Question.apply(this, arguments);
};

JSQuestion.prototype = Object.create(Question.prototype);

JSQuestion.prototype.answer = function(content, cb) {
	var ast;

	try {
		JSHint(content, this.options.jshint);
		if (JSHint.errors.length) {
			return cb(this.generateResponse(
				JSHint.errors.map(function(err) {
					return this.generateError(errorTypes.LINT, err.reason, err.line);
				}, this)
			));
		}

		var checker = new JscsStringChecker();
		checker.registerDefaultRules();
		checker.configure(this.options.jscs || {});
		var styleErrors = checker.checkString(content);
		if (styleErrors.getErrorList().length) {
			return cb(this.generateResponse(
				styleErrors.getErrorList().map(function(err) {
					return this.generateError(errorTypes.STYLE, err.message, err.line, err.column);
				}, this)
			));
		}

		ast = acorn.parse(content);
	} catch (e) {
		return cb(this.generateResponse(
			[this.generateError(errorTypes.ERROR, e.message, null, null)]
		));
	}

	this.runTest(content, ast, function(testFailures) {
		if (testFailures) {
			var firstFailureAdded = false;
			var errors = _.reduce(testFailures, function(ret, testFailure) {
				if (!firstFailureAdded || this.options.returnAllTestErrors) {
					firstFailureAdded = true;
					var testError = testFailure.error;
					var firstStack = testError.stack.split('\n')[1];
					if (firstStack && firstStack.indexOf('eval') > -1) {
						var position = firstStack.match(/(\d+)\:(\d+)\)$/);
						ret.push(this.generateError(
							errorTypes.ERROR, 
							testError.message, 
							parseInt(position[1], 10), 
							parseInt(position[2], 10)
						));
					} else {
						var message = testFailure.name;
						if (this.options.returnFailureMessages) {
							ret += ' : ' + testError.message;
						}
						ret.push(this.generateError(errorTypes.FAILURE,  message, null, null));
					}
				}
				return ret;
			}, []);
			return cb(this.generateResponse(errors));
		}
		return cb(this.generateResponse());
	});
};

module.exports = JSQuestion;
