//datastructure = {
//  _id: 0,
//  SID: '',
//  URI: '',
//  publishers: [{
//    SID: '',
//    URI: '',
//  }],
//}

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
//        subscription_collection.findOne({_id: ObjectID.createFromHexString(id)}, function(error, result) {
        subscription_collection.findOne({SID: SubscriberSID}, function(error, result) {
          if( error ) callback(error)
          else callback(null, result)
        });
      }
    });
};

//SubscriptionsStore.prototype.save = function(subscriptions, callback) {
//    this.getCollection(function(error, subscription_collection) {
//      if( error ) callback(error)
//      else {
//        if( typeof(subscriptions.length)=="undefined")
//          subscriptions = [subscriptions];

//        for( var i =0;i< subscriptions.length;i++ ) {
//          subscription = subscriptions[i];
//          if( subscription.publishers === undefined ) subscription.publishers = [];
//          for(var j =0;j< subscription.publishers.length; j++) {
//          }
//        }

//        subscription_collection.insert(subscriptions, function() {
//          callback(null, subscriptions);
//        });
//      }
//    });
//};

SubscriptionsStore.prototype.save = function(subscription, callback) {
    this.getCollection(function(error, subscription_collection) {
      if( error ) callback(error)
      else {
//        s = SubscriptionsStore.findBySID(subscription.SID);
//        if (s == null) {
//          if( subscription.publishers === undefined ) subscription.publishers = [];

//          subscription_collection.insert(subscriptions, function() {
//            callback(null, subscription);
//          });
//        } else {
//            callback(null, s);
//        }
        
        subscription_collection.findOne({SID: subscription.SID}, function(error, result) {
          if( error ) {
            if( subscription.publishers === undefined ) subscription.publishers = [];

            subscription_collection.insert(subscriptions, function() {
              callback(null, subscription);
            });
          }
          else callback(null, result)
        });
        
      }
    });
};

SubscriptionsStore.prototype.addPublisherToSubscriber = function(subscriberSID, publisher, callback) {
  this.getCollection(function(error, subscription_collection) {
    if( error ) callback( error );
    else {
      subscription_collection.update(
        //{_id: ObjectID.createFromHexString(subscriptionId)},
        {SID: subscriberSID},
        {"$push": {publishers: publisher}},
        function(error, subscription){
          if( error ) callback(error);
          else callback(null, subscription)
        });
    }
  });
};
exports.SubscriptionsStore = SubscriptionsStore;
