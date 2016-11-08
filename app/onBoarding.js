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
