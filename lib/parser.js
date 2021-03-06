var Lexer = require('./lexer');
var Node = require('./node');
var util = require('util');

var Parser = module.exports = function Parser(source) {
	var root = new Node();
  root.modules = [];
  root.type = 'root';
  
  this.source = source;
  this.lexer = new Lexer(this.source);
  this.current = this.root = root;
	this.warnings = [];
	this.stats = {};
};

Parser.prototype = {
  recurseToType: function(type) {
    if (Array.isArray(type)) {
      if (this.current._parent && type.indexOf(this.current._parent._type) > -1) {
        this.current = this.current._parent;
      } else {
        while (type.indexOf(this.current._type) === -1 && this.current._parent) {
          this.current = this.current._parent;
        }
      }
    } else {
      if (this.current._parent && this.current._parent._type === type) {
        this.current = this.current._parent;
      } else {
        while (this.current._type !== type && this.current._parent) {
          this.current = this.current._parent;
        }
      }
    }
  },
  
  addNode: function(key, node) {
    if (!this.current[key]) this.current[key] = [];
    
    var idx = this.current[key].push(node);
    this.current = this.current[key][idx - 1];
  },

	addWarning: function(message) {
		this.warnings.push({line: this.lexer.lineno, message: message});
	},

  parse: function() {
		this.stats.startTime = Date.now();
    var token;
    while ((token = this.lexer.next) && token.type != 'eos') {      
      switch(token.type) {
        case 'newline':
          if (this.current._type === 'text') {
            this.current._newlines++;
          }
          break;
        case 'module':
          this.recurseToType('root');
          
          var node = new Node(this.current, 'module');
          node.name = token.values[0];
          node.require = token.values[1].replace(/[\(\)]/g, '');
          
          this.addNode('modules', node);
          break;
        case 'constructor':
				case 'klass':
					if(token.type === 'klass') {
						this.addWarning("Usage of identify `Class:` is now deprecated, please use `Constructor:` instead.");
					}
					
          this.recurseToType('module');
          
          var node = new Node(this.current, 'constructor');
          node.name = token.values[0];
          
          this.addNode('constructors', node);
          break;
        case 'inherits':
          this.recurseToType('constructor');
          var nodes = token.values[0].split(', ');
          if (nodes.length > 1) {
            var self = this;
            nodes.forEach(function(node) {
              var node = new Node(this.current, 'inheritance');
              node.name = node;
            
              self.addNode('inherits', node);
            });
          } else {
            var node = new Node(this.current, 'inheritance');
            node.name = nodes[0];
          
            this.addNode('inherits', node);
          }
          break;
        case 'method':
          this.recurseToType(['module', 'constructor']);
          
          var node = new Node(this.current, 'method');
          node.name = token.values[0];
          node.signature = token.values[1];
          
          this.addNode('methods', node);
          break;
        case 'event':
          this.recurseToType(['module', 'constructor']);
          
          var node = new Node(this.current, 'event');
          node.name = token.values[0];
          
          this.addNode('events', node);
          break;
        case 'param':
          this.recurseToType(['constructor', 'method', 'event']);
          
          var node = new Node(this.current, 'parameter');
          node.name = token.values[0];
          node.types = token.values[1].split('|');
          node.description = [token.values[2]];
          
          this.addNode('parameters', node);
          break;
        case 'property':
          this.recurseToType(['module', 'constructor']);
          
          var node = new Node(this.current, 'property');
          node.name = token.values[0];
          
          this.addNode('properties', node);
          break;
        case 'code':
          this.recurseToType(['module', 'constructor', 'method', 'event', 'property']);
          
          var node = new Node(this.current, 'code');
          var indentation = (token.values[1] || "").replace(/\t/g, '  ');
          
          node.value = indentation + token.values[2];
          node.indent = indentation.length / 2;
          // in this case we need this data in the end document.
          node.type = 'code';
          
          this.addNode('description', node);
          break;
        case 'text':
          if (this.current._type === 'text' && this.current._newlines === 1) {
            this.current.value += ' ' + token.values[0];
            node._newlines = 0;
          } else {
            this.recurseToType(['module', 'constructor', 'method', 'event', 'property']);
          
            var node = new Node(this.current, 'text');
            node.value = token.values[0];
            node._newlines = 0;
            // in this case we need this data in the end document.
            node.type = 'text';
          
            this.addNode('description', node);
          }
          break;
      }
      this.lexer.advance()
    }
		this.stats.endTime = Date.now();
  },

	toJSON: function() {
		JSON.stringify(this.root);
	},
	
	statistics: function() {
		return {
			lines: this.lexer._lines,
			time: {
				start: this.stats.startTime,
				end: this.stats.endTime,
				elapsed: this.stats.endTime - this.stats.startTime,
				lines_per_millisecond: this.lexer._lines / (this.stats.endTime - this.stats.startTime)
			}
		}
	}
}