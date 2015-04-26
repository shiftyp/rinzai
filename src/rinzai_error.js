var RinzaiError = function (type, message, line, char) {
	this.type = type;
	this.message = message;
	this.line = line;
	this.char = char;
};

module.exports = RinzaiError;
