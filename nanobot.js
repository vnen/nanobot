var Util   = require("util");
var Bot    = require("./lib/irc");
var moment = require('moment')
var boo    = require('boo')
var spice  = require('spice')
var profile = require('./nanoprofile')


function ensure_not_active(bot, cx) {
  if (!bot.current_ww)
    cx.channel.send_reply(cx.sender, "No WordWar active.")
  return true
}

var WordWar = boo.Base.derive({
  init:
  function _init(sender, minutes) {
    this.start_time   = moment(new Date)
    this.end_time     = moment(new Date).add('minutes', minutes)
    this.participants = [sender]
    this.starter      = sender
    this.open         = true
    this.time         = minutes
  }

, join:
  function _add(name) {
    this.participants.push(name)
  }

, part:
  function _part(name) {
    this.participants = this.participants.filter(function(a){ return a !== name })
  }

, is_participating:
  function _is_participating(name) {
    return this.participants.some(function(a){ return a === name })
  }

, notify:
  function _notify() {
    return spice('{:sender} is asking for a {:minutes} minutes WordWar! '
                +'Type "!join" to participate. Type "!start" to begin.'
                , { sender:  this.starter
                  , minutes: this.time })
  }

, notify_start:
  function _notify_start() {
    this.open = false
    return spice('WordWar from {:start} to {:end} starting. Go {:participants}!'
                , { participants: this.participants.join(', ')
                  , start:        this.start_time.format('hh:mm')
                  , end:          this.end_time.format('hh:mm')
                  })
  }

, notify_end:
  function _notify_end() {
    return spice('WordWar ended, {:participants}.'
                , { participants: this.participants.join(', ') })
  }
})


Util.inherits(NanoBot, Bot)
function NanoBot(profile) {
	Bot.call(this, profile)
	this.set_log_level(this.LOG_ALL)
	this.set_trigger("!")
};


NanoBot.prototype.init = function() {
	Bot.prototype.init.call(this)

  this.current_ww = null

	this.register_command("ww", this.ww)
  this.register_command("stop", this.stop_ww)
  this.register_command("join", this.join_ww)
  this.register_command("start", this.start_ww)
  this.register_command("part", this.part_ww)
	this.on('command_not_found', this.unrecognized)
};

NanoBot.prototype.ww = function(cx, text) {
  var minutes = Number(text)
  if (this.current_ww)
    return cx.channel.send_reply(cx.sender, "There's a WordWar going on already!")
  if (isNaN(minutes))
    return cx.channel.send_reply(cx.sender, "Use `!ww <minutes>`")

  this.current_ww = WordWar.make(cx.sender, minutes)
  cx.channel.send(this.current_ww.notify())
};

NanoBot.prototype.start_ww = function(cx, text) {
  if (!ensure_not_active(this, cx)) return

  this.current_ww.open = false
  this.current_ww.timer = setTimeout(function() {
      cx.channel.send(this.current_ww.notify_end())
      this.current_ww = null
  }.bind(this), this.current_ww.time * 60 * 1000)
  cx.channel.send(this.current_ww.notify_start())
}

NanoBot.prototype.stop_ww = function(cx, text) {
  if (!ensure_not_active(this, cx))  return

  clearTimeout(this.current_ww.timer)
  this.current_ww = null
  cx.channel.send_reply(cx.sender, "WordWar stopped.")
}

NanoBot.prototype.join_ww = function(cx, text) {
  if (!ensure_not_active(this, cx))  return
  if (!this.current_ww.open)
    return cx.channel.send_reply(cx.sender, "WordWar is already underway.")
  if (this.current_ww.is_participating(cx.sender))
    return cx.channel.send_reply(cx.sender, "You're already in.")

  this.current_ww.join(cx.sender)
  cx.channel.send(cx.sender + " joined the WordWar")
}

NanoBot.prototype.part_ww = function(cx, text) {
  if (!ensure_not_active(this, cx))  return
  if (this.current_ww.is_participating(cx.sender)) {
    this.current_ww.part(cx.sender)
    cx.channel.send(cx.sender + " left the WordWar")
  }
}

NanoBot.prototype.unrecognized = function(cx, text) {
	cx.channel.send_reply(cx.sender, "There is no command: "+text)
}


;(new NanoBot(profile)).init()