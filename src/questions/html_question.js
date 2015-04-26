var Question = require('./question.js');
var errorTypes = require('../error_types.js');

var domify = require('domify');

var HTMLQuestion = function() {
	Question.apply(this, arguments);
};

HTMLQuestion.prototype = Object.create(Question.prototype);

HTMLQuestion.prototype.answer = function(content, cb) {
	var parser = new DOMParser();
	var node;

	try {
		var parseErrors = this.validate(content);
		if (parseErrors.length) {
			return cb(this.generateResponse(parseErrors));
		}
		node = domify(content);
	} catch(e) {
		return cb(this.generateResponse([
			new this.generateError(errorTypes.ERROR, e.message, null, null)
		]));
	}
	
	var nodes = [];
	if (node instanceof DocumentFragment) {
		nodes = _.toArray(node.querySelectorAll('*'));
	} else {
		nodes = [node];
	}
	this.runTest(content, nodes, function(testFailures) {
		if (testFailures) {
			var firstFailureAdded = false;
			return cb(this.generateResponse(
				testFailures.reduce(function (ret, testFailure) {
					if (!firstFailureAdded || this.options.returnAllTestErrors) {
						firstFailureAdded = true;
						var message = testFailure.name;
						if (this.options.returnErrorMessages) {
							message += ' : ' + testFailure.error.message;
						}
						ret.push(this.generateError(errorTypes.FAILURE, message, null, null));
					}
					return ret;
				}, [], this)
			));
		}
		
		return cb(this.generateResponse());
	});
};

HTMLQuestion.prototype.validate = function(html) {
	var parser = new DOMParser();
	var d = parser.parseFromString('<?xml version="1.0"?><html>\n' + html + '\n</html>','text/xml');
	var errors = [];
	if (d.querySelector('parsererror')) {
		errors = Array.prototype.map.call(d.querySelectorAll('parsererror > div'), function(node) {
			var errorText = node.textContent;
			var matches = errorText.match(/error on line (\d+) at column (\d+)\:\s(.+)/);
			return this.generateError(errorTypes.LINT, matches[3], parseInt(matches[1], 10) - 1, parseInt(matches[2], 10));
		}, this);
	} else {
			d = parser.parseFromString(html, 'text/html');
			allnodes = d.getElementsByTagName('*');
			for (var i = allnodes.length - 1; i >= 0; i--) {
					if (allnodes[i] instanceof HTMLUnknownElement) {
						errors.push(this.generateError(errorTypes.LINT, 'Unknown HTML element: ' + allnodes[i].tagName, null, null));
					}
			}
	}
	return errors;
};

module.exports = HTMLQuestion;
