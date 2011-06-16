//datastructure = {
//  _id: 0,
//  SID: '',
//  URI: '',
//  publishers: [{
//    SID: '',
//    URI: '',
//  }],
//}

// Example data:
//var item1 = {SID: "1"};
//var item2 = {SID: "2", URI: "http://localhost/smob", publishers: [{SID: "3", URI: "http://localhost/smob"},{SID: "4", URI: "http://localhost/smob2"}]};
//db.subscriptions.save(item1);
//db.subscriptions.save(item2);
//db.subscriptions.find();
//db.subscriptions.find({"publishers.URI": "http://localhost/smob"});
//db.subscriptions.find({"publishers.URI": "http://localhost/smob"}).forEach(printjson);
//db.subscriptions.find({"publishers.URI": "http://localhost/smob"}, {SID:1})
//db.subscriptions.find({"publishers.URI": "http://localhost/smob"}, {SID:1, _id:0}).forEach(printjson);


var sys = require("sys");
//var Db= require('mongodb/db').Db,
//    ObjectID= require('mongodb/bson/bson').ObjectID,
//    Server= require('mongodb/connection').Server;
var Db = require('mongodb').Db,
    Connection = require('mongodb').Connection,
    Server = require('mongodb').Server,
    BSON = require('mongodb').BSONNative;

SubscriptionsStore = function(host, port) {
  this.db= new Db('socketpusbsub', new Server(host, port, {auto_reconnect: true}, {}));
  this.db.open(function(){});
};

SubscriptionsStore.prototype.getCollection= function(callback) {
  this.db.collection('subscriptions', function(error, subscription_collection) {
    if( error ) callback(error);
    else callback(null, subscription_collection);
  });
};

SubscriptionsStore.prototype.findAll = function(callback) {
    this.getCollection(function(error, subscription_collection) {
      if( error ) callback(error)
      else {
        subscription_collection.find(function(error, cursor) {
          if( error ) callback(error)
          else {
            cursor.toArray(function(error, results) {
              if( error ) callback(error)
              else callback(null, results)
            });
          }
        });
      }
    });
};

SubscriptionsStore.prototype.findBySID = function(SubscriberSID, callback) {
    this.getCollection(function(error, subscription_collection) {
      if( error ) callback(error)
      else {
        subscription_collection.findOne({SID: SubscriberSID}, function(error, result) {
          if( error ) callback(error)
          else {
            callback(null, result);
          }
        });
      }
    });
};


SubscriptionsStore.prototype.findByPublisherURI = function(PublisherURI, callback) {
    this.getCollection(function(error, subscription_collection) {
      if( error ) callback(error)
      else {
        subscription_collection.find({"publishers.URI": PublisherURI}, {SID:1, _id:0}, function(error, cursor) {
          if( error ) callback(error)
          else {
//            for (subscriber in cursor) {
//            
//            }
            cursor.toArray(function(error, results) {
              if( error ) callback(error)
              else callback(null, results)
            });
          }
        });
      }
    });
};

SubscriptionsStore.prototype.save = function(subscription, callback) {
    this.getCollection(function(error, subscription_collection) {
      sys.puts("got collection "+subscription_collection);
      if( error ) callback(error)
      else {        
        subscription_collection.findOne({SID: subscription.SID}, function(error, result) {
          if( error ) callback(error)
          else {
            sys.puts("no error in find");
            if (result) {
              sys.puts("result "+result);
              callback(null, result);
            } else {
              if( subscription.publishers === undefined ) subscription.publishers = [];

              subscription_collection.insert(subscription, function() {
                sys.puts("subscription:  "+subscription);
                callback(null, subscription);
              });
            }
          }
        });
        
      }
    });
};

SubscriptionsStore.prototype.addPublisherToSubscriber = function(subscriberSID, publisher, callback) {
  sys.puts(subscriberSID, publisher.URI);
  this.getCollection(function(error, subscription_collection) {
    if( error ) callback( error );
    else {
      sys.puts("got collection "+subscription_collection);
      subscription_collection.update(
        //{_id: ObjectID.createFromHexString(subscriptionId)},
        {SID: subscriberSID},
        {"$push": {publishers: publisher}},
        function(error, subscription){
          if( error ) callback(error);
          else {
            sys.puts("subscription:  "+subscription);
            callback(null, subscription);
          }
        });
    }
  });
};
exports.SubscriptionsStore = SubscriptionsStore;
