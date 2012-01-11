
var sys = require("sys");

SocketsStore = function() {
  this.dict = {};
};

SocketsStore.prototype.add_socketclient = function(sid,cid, callback) {
  this.dict[sid] = {socketId: sid, clientId:cid};
  var item = this.dict[sid];
  return item;
};

SocketsStore.prototype.get_socketclient = function(sid,callback) {
  var item = this.dict[sid];
  return item;
};

SocketsStore.prototype.get_socketclient_from_clientId = function(cid,callback) {
  for(var sid in this.dict) {
    if (this.dict[sid].clientId == cid) {
      return sid;
    }
  }
  return false;
};


exports.SocketsStore = SocketsStore;
