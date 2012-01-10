
var sys = require("sys");

SocketsStore = function() {
  this.dict = {};
};

SocketsStore.prototype.add_socketclient = function(socketId,clientId, callback) {
  this.dict[socketId] = clientId;
  
};

SocketsStore.prototype.get_socketclient = function(socketId,callback) {
  return this.dict[socketId];
};


exports.SocketsStore = SocketsStore;
