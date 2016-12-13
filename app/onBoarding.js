// app/onBoarding.js

var db;
var bot;
var user;

/**
 * Expose OnBoarding
 */
module.exports = OnBoarding;

/**
 *
 * @param {Db} db
 * @param {TelegramBot} bot
 * @param {TelegramUser} telegramUser
 * @constructor
 */
function OnBoarding(mongoDb, telegramBot, telegramUser) {
  db = mongoDb;
  bot = telegramBot;
  user = telegramUser;
}

/**
 * Will handle the start procedure with new users
 */
OnBoarding.prototype.start = function() {
  var users = db.collection('users');
  users.count(function(err, count) {
    if (err) {
      console.log("Error while counting users: " + err);
    } else if (count === 0) {
      //Add user to db - this becomes the owner and there can be only one owner
      user.authLevel = 1;
      user._id = user.id;
      users.insertOne(user, function(err, result) {
        if (err) {
          console.log("Error while adding a user to the db: " + err);
        } else {
          var json = JSON.stringify(result, null, 2);
          if (result.insertedCount !== 1) {
            console.log("Unexpected result while adding a user to the db, result: " + json);
          } else {
            console.log("Successfully added user to the db, result: " + json);
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
 * Process any unauthorized messages
 *
 * @param {Message} msg
 */
OnBoarding.prototype.processUnauthorizedMessage = function(msg) {
  switch(msg.chat.type) {
    case "private":
      findOwner(processUnauthorizedPrivateMessage);
      break;
    default:
      //case for everything else like 'group', 'supergroup' and what else...
      //TODO: implement support for group chats and what else...
      console.log("group message");
  }
}

function processUnauthorizedPrivateMessage(err, owner) {
  if(err) {
    var errorMessage = "Error while processing unauthorized private message: " + err;
    console.log(errorMessage);
    return;
  }

  if (!owner) {
    console.log("No owner found in the DB, please add one");
    return;
  }

  storeUser();

  //2 = allowed user, 3 = blocked user
  var inlineKeyboardButtonLeft = {};
  inlineKeyboardButtonLeft.text = 'Allow';
  inlineKeyboardButtonLeft.callback_data = user.id + ' 2';

  var inlineKeyboardButtonRight = {};
  inlineKeyboardButtonRight.text = 'Block';
  inlineKeyboardButtonRight.callback_data = user.id + ' 3';

  var options = {};
  options.reply_markup = {};
  options.reply_markup.inline_keyboard =
    [[inlineKeyboardButtonLeft, inlineKeyboardButtonRight]];

  var message = ' is contacting me, is he allowed?';
  if (user.username) {
    message = ' (@' + user.username + ')' + message;
  }
  if (user.last_name) {
    message = ' ' + user.last_name + message;
  }
  //The first_name is not optional
  message = user.first_name + message;

  bot.sendMessage(owner.id, message, options);

}

function storeUser() {
  var users = db.collection('users');
  //authLevel 0 means this user hasn't been processed properly
  user.authLevel = 0;
  user._id = user.id;
  //This will give an error when the user already exists
  users.insertOne(user, function(err, result) {
    //This might result in an error when the user already exists, but that's okay
    // if (err) {
    //   console.log("Error while adding a user to the db: " + err);
    // } else {
    //   if (result.insertedCount !== 1) {
    //     console.log("Unexpected result while adding a user to the db, result: " + result);
    //   } else {
    //     console.log("Successfully added user to the db, result: " + result);
    //   }
    // }
  });
}

function findOwner(cb) {
  var users = db.collection('users');
  //Find the one owner
  users.findOne({'authLevel':1}, cb);
}

/**
 * Send a greeting to the user
 */
OnBoarding.prototype.sendGreeting = function() {
  var greetings = db.collection('greetings');
  greetings.count(function(err, count) {

    if (count <= 0) {
      //There are no greetings
      return;
    }
    var random = Math.floor(Math.random() * count);
    greetings.find().skip(random).nextObject(function(err, item) {
      if(err) {
        bot.sendMessage(user.id, err);
      } else {
        bot.sendMessage(user.id, item.message);
      }
    });
  });
}
