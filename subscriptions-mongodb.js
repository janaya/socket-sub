//datastructure = {
//  _id: 0,
//  ClientId: '',
//  URI: '',
//  publishers: [{
//    ClientId: '',
//    URI: '',
//    confirmed: false;
//  }],
//}

// Example data:
//var item1 = {ClientId: "1"};
//var item2 = {ClientId: "2", URI: "http://localhost/smob", publishers: [{ClientId: "3", URI: "http://localhost/smob"},{ClientId: "4", URI: "http://localhost/smob2"}]};
//db.subscriptions.save(item1);
//db.subscriptions.save(item2);
//db.subscriptions.find();
//db.subscriptions.find({"publishers.URI": "http://localhost/smob"});
//db.subscriptions.find({"publishers.URI": "http://localhost/smob"}).forEach(printjson);
//db.subscriptions.find({"publishers.URI": "http://localhost/smob"}, {ClientId:1})
//db.subscriptions.find({"publishers.URI": "http://localhost/smob"}, {ClientId:1, _id:0}).forEach(printjson);

//db.subscriptions.find({ClientId: "3243485626298934","publishers.URI": "foo"})


//db.subscriptions.update({ClientId: "3243485626298934"},{"$push": {publishers: {URI: "foo"}}})

//db.subscriptions.update({ClientId: "3243485626298934"},{"$addToSet": {publishers: {URI: "foo"}}})



//db.subscriptions.update({ClientId: "3243485626298934", publishers: [] })
//db.subscriptions.update({ClientId: "3243485626298935"},{ClientId: "3243485626298935"},true)

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

SubscriptionsStore.prototype.findByClientId = function(subscriberClientId, callback) {
    this.getCollection(function(error, subscription_collection) {
      if( error ) callback(error)
      else {
        subscription_collection.findOne({ClientId: subscriberClientId}, function(error, result) {
          if( error ) callback(error)
          else {
            callback(null, result);
          }
        });
      }
    });
};

SubscriptionsStore.prototype.findByPublisherURI = function(publisherURI, callback) {
    this.getCollection(function(error, subscription_collection) {
      if( error ) callback(error)
      else {
        subscription_collection.find({"publishers.URI": publisherURI}, {ClientId:1, _id:0}, function(error, cursor) {
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

SubscriptionsStore.prototype.findByPublisherURInotconfirmed = function(publisherURI, callback) {
    this.getCollection(function(error, subscription_collection) {
      if( error ) callback(error)
      else {
//        subscription_collection.find({"publishers.URI": publisherURI, "publishers.confirmed": false}, {ClientId:1, _id:0}, function(error, cursor) {
        subscription_collection.find({"publishers.URI": publisherURI, "publishers.confirmed": false}, function(error, cursor) {
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
      if( error ) callback(error)
      else {        
        //db.subscriptions.update({ClientId: "3243485626298935"},{ClientId: "3243485626298935"},true)
        subscription_collection.update(subscription, subscription, {upsert:true, safe:true}, function(error, numbersubscriptions) {
          if( error ) callback(error);
          else {
            sys.puts("subscription succesfully stored or retrieved:  "+sys.inspect(subscription));
            callback(null, subscription);
          }
        });
      }
    });
};

SubscriptionsStore.prototype.addPublisherToSubscriber = function(subscriberClientId, publisher, callback) {
  this.getCollection(function(error, subscription_collection) {
    if( error ) callback( error );
    else {
      //db.subscriptions.update({ClientId: "3243485626298934"},{"$addToSet": {publishers: {URI: "foo"}}})
      subscription_collection.findAndModify(
        {ClientId: subscriberClientId}, [],
        {"$addToSet": {publishers: publisher}}, {new:true}, 
        function(error, subscription){
          if( error ) callback(error);
          else {
            sys.puts("publisher succesfully stored or retrieved from subscriber:  "+sys.inspect(subscription));
            callback(null, subscription);
          }
        });
    }
  });
};


SubscriptionsStore.prototype.confirmByPublisherURI = function(publisherURI, callback) {
    this.getCollection(function(error, subscription_collection) {
      if( error ) callback(error)
      else {
        subscription_collection.findAndModify(
          {"publishers.URI": publisherURI, "publishers.confirmed": false}, [],
          {"$set": {"publishers.confirmed": true}}, {new:true}, //, {ClientId:1, _id:0}
          function(error, cursor) {
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


SubscriptionsStore.prototype.confirmBySubscription = function(subscription, callback) {
    this.getCollection(function(error, subscription_collection) {
      if( error ) callback(error)
      else {
        subscription_collection.findAndModify(
          subscription, [],
          {"$set": {"publishers.confirmed": true}}, {new:true}, //, {ClientId:1, _id:0}
          function(error, subscription) {
            if( error ) callback(error)
            else {
                callback(null, subscription);
            }
          }
        );
      }
    });
};

exports.SubscriptionsStore = SubscriptionsStore;
