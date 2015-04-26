var HTMLQuestion = require('./questions/html_question.js');
var JSQuestion = require('./questions/js_question.js');
var CSSQuestion = require('./questions/css_question.js');

var questionTypes = {
	'html': HTMLQuestion,
	'javascript': JSQuestion,
	'css': CSSQuestion
};

var Rinzai = function (questions, options) {
	this.options = options || {};
	this.questions = [];
	this.questionsById = {};

	this.addQuestions(questions);
};

Rinzai.prototype.addQuestion = function (q) {
	if (questionTypes.hasOwnProperty(q.type)) {
		var question = new questionTypes[q.type](q, this.options);

		this.questions.push(question);
		this.questionsById[q.id] = question;

		return question;
	} else {
		throw new Error('Question type is either unsupported or undefined. Type: ' + q.type);
	}
};

Rinzai.prototype.addQuestions = function(questions) {
	questions.forEach(this.addQuestion, this);
};

module.exports = Rinzai;
