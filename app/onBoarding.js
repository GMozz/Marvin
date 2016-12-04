// app/onBoarding.js

var db;
var bot;
var userId;

/**
 * Expose OnBoarding
 */
module.exports = OnBoarding;

/**
 *
 * @param {Db} db
 * @param {TelegramBot} bot
 * @param {String} userId
 * @constructor
 */
function OnBoarding(mongoDb, telegramBot, telegramUserId) {
  db = mongoDb;
  bot = telegramBot;
  userId = telegramUserId;
}

/**
 * Will handle the start procedure with new users
 */
OnBoarding.prototype.start = function(user) {
  var users = db.collection('users');
  users.count(function(err, count) {
    if (err) {
      console.log("Error while counting users: " + err);
    } else if (count === 0) {
      //Add user to db - this becomes the owner
      users.insertOne(user, function(err, result) {
        if (err) {
          console.log("Error while adding a user to the db: " + err);
        } else {
          if (result.insertedCount !== 1) {
            console.log("Unexpected result while adding a user to the db, result: " + result);
          } else {
            console.log("Successfully added user to the db, result: " + result);
          }
        }
      });
    } else {
      console.log("Will be implemented in the future")
      //TODO: implement the rest of the onboarding process
    }
  });
}

/**
 * Send a greeting to the user
 */
OnBoarding.prototype.sendGreeting = function() {
  var greetings = db.collection('greetings');
  greetings.count(function(err, count) {
    var random = Math.floor(Math.random() * count);
    greetings.find().skip(random).nextObject(function(err, item) {
      if(err) {
        bot.sendMessage(userId, err);
      } else {
        bot.sendMessage(userId, item.message);
      }
    });
  });
}
