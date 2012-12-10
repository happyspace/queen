var EventEmitter = require('events').EventEmitter,
	_ = require('underscore'),
	utils = require('./utils.js'),
	precondition = require('precondition');

exports.create = function(workerConfig, options){
	var workforce = new Workforce(workerConfig);

	if(options.stopHandler)	workforce.stopHandler = options.stopHandler;
	if(options.workerHandler) workforce.workerHandler = options.workerHandler;
	if(options.providerFilter) workforce.providerFilter = options.providerFilter;
	if(options.killOnStop !== void 0) workforce.killOnStop = options.killOnStop;
	
	return workforce;
};

var Workforce = exports.Workforce = function(workerConfig){
	precondition.checkDefined(workerConfig, "Worker config object must be defined");

	var self = this;
	this.emitter = new EventEmitter();
	this.workers = [];
	this.workerConfig = workerConfig;
	this.pendingWorkers = 0;

	this.kill = _.once(this.kill.bind(this));
	this.api = Object.freeze(getApi.call(this));
};

var getApi = function(){
	var api = this.broadcast.bind(this);
	api.on = this.emitter.on.bind(this.emitter);
	api.removeListener = this.emitter.removeListener.bind(this.emitter);
	api.kill = this.kill;
	api.populate = this.populate.bind(this);
	
	return api;
};

Workforce.prototype.workerHandler = utils.noop;
Workforce.prototype.stopHandler = utils.noop;
Workforce.prototype.providerFilter = function(){return true;};
Workforce.prototype.killOnStop = true;

Workforce.prototype.populate = function(workerProviders){
	var self = this;

	if(!_.isArray(workerProviders)) workerProviders = [workerProviders];

	workerProviders = workerProviders.filter(this.providerFilter);

	self.pendingWorkers += workerProviders.length;

	workerProviders.forEach(function(workerProvider){
		workerProvider(self.workerConfig, function(worker){
			self.pendingWorkers--;
			if(worker !== void 0){
				self.addWorker(worker);
			}
		});
	});

	if(this.pendingWorkers === 0 && self.workers.length === 0){
		this.stop();
	}
};

Workforce.prototype.stop = function(){
	this.workers.concat([]).forEach(function(worker){
		worker.kill();
	});

	this.stopHandler();

	if(this.killOnStop){
		this.kill();
	}
};

Workforce.prototype.kill = function(){
	this.workers.concat([]).forEach(function(worker){
		worker.kill();
	});
	
	this.emitter.emit('dead');
	this.emitter.removeAllListeners();
};

Workforce.prototype.broadcast = function(message){
	this.workers.forEach(function(worker){
		worker(message);
	});
};

Workforce.prototype.addWorker = function(worker){
	var self = this;

	this.workers.push(worker);
	worker.on('dead', function(){
		self.workers.splice(self.workers.indexOf(worker), 1);

		if(self.pendingWorkers === 0 && self.workers.length === 0){
			self.stop();
		}
	});

	worker.on('message', function(message){
		self.emitter.emit('message', message, worker);
	});

	if(this.pendingMessages > 0){
		this.pendingMessages.forEach(function(message){
			worker(message);
		});
	}
	
	this.workerHandler(worker);
};