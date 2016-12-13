// app/bot.js

/*
 * External libraries
 */
var config = require('getconfig');
var MongoClient = require('mongodb').MongoClient;

/*
 * Own classes
 */
var Bot = require('./bot');

//Variable for the Marvin bot
var bot;

var url = "mongodb://" + config.mongoDbHostName + ":" + config.mongoDbPort + "\/" + config.mongoDbDatabaseName;
var db;
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, mongoDb) {
  if (err) {
    console.log("err = " + err);
  } else {
    db = mongoDb;

    //Prepare necessary collections
    db.createCollection("greetings", {size:10000, max:1000, w:1}, function(err, collection) {
      if (err) {
        console.log("Error while creating collection greetings: " + err);
      }
    });

    /*
     * Based on the Telegram user - https://core.telegram.org/bots/api#user
     * id - Integer
     * first_name - String
     * last_name - String
     * username - String
     * Below are the non-telegram fields, customly added for this program
     * authLevel - Integer, 0 = not yet processed, 1 = owner, 2 = allowed user, 3 = blocked user
     */
    db.createCollection("users", {size:10000, max:1000, w:1}, function(err, collection) {
      if (err) {
        console.log("Error while creating collection users: " + err);
      }
    });

    bot = new Bot(db, config);
  }
});
