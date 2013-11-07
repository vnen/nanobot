var Util   = require("util");
var Bot    = require("./lib/irc");
var moment = require('moment')
var boo    = require('boo')
var spice  = require('spice')
var profile = require('./nanoprofile')


function ensure_not_active(bot, cx) {
  if (!bot.current_ww.active)
    return cx.channel.send_reply(cx.sender, "No WordWar active.")
  else
    return true
}

var WordWar = boo.Base.derive({
  init:
  function _init() {
    this.open   = false
    this.active = false
  }

, activate:
  function _activate(sender, minutes) {
    this.participants = [sender]
    this.starter      = sender
    this.open         = true
    this.active       = true
    this.time         = minutes
  }

, stop:
  function _stop() {
    this.open   = false
    this.active = false
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
    this.open       = false
    this.start_time = moment(new Date)
    this.end_time   = moment(new Date).add('minutes', this.time)
    return spice('WordWar from {:start} to {:end} starting. Go {:participants}!'
                , { participants: this.participants.join(', ')
                  , start:        this.start_time.format('HH:mm')
                  , end:          this.end_time.format('HH:mm')
                  })
  }

, notify_end:
  function _notify_end() {
    return spice('WordWar ended, {:participants}.'
                , { participants: this.participants.join(', ') })
  }

, notify_status:
  function _notify_status() {
    return spice('WordWar will end on {:end} ({:minutes} minutes left). {:participants} nanowriters are in.'
                , { participants: this.participants.length
                  , end:          this.end_time.format('HH:mm')
                  , minutes:      moment(this.end_time.toDate())
                                    .subtract(new Date)
                                    .format('HH:mm')
                  })
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

  this.current_ww = WordWar.make()

	this.register_command("ww", this.ww)
  this.register_command("stop", this.stop_ww)
  this.register_command("join", this.join_ww)
  this.register_command("start", this.start_ww)
  this.register_command("part", this.part_ww)
  this.register_command("status", this.status_ww)
	this.on('command_not_found', this.unrecognized)
};

NanoBot.prototype.ww = function(cx, text) {
  var minutes = Number(text)
  if (this.current_ww.active)
    return cx.channel.send_reply(cx.sender, "There's a WordWar going on already!")
  if (isNaN(minutes) || minutes < 0)
    return cx.channel.send_reply(cx.sender, 'Use "!ww [minutes]" (e.g.: "!ww 30"). The default are 20 minutes.')

  this.current_ww.activate(cx.sender, minutes || 20)
  cx.channel.send(this.current_ww.notify())
};

NanoBot.prototype.start_ww = function(cx, text) {
  if (!ensure_not_active(this, cx)) return
  if (!this.current_ww.open)
    return cx.channel.send_reply(cx.sender, "There's a WordWar going on already. " + this.current_ww.notify_status())

  this.current_ww.open = false
  this.current_ww.timer = setTimeout(function() {
      cx.channel.send(this.current_ww.notify_end())
      this.current_ww.stop()
  }.bind(this), this.current_ww.time * 60 * 1000)
  cx.channel.send(this.current_ww.notify_start())
}

NanoBot.prototype.stop_ww = function(cx, text) {
  if (!ensure_not_active(this, cx))  return

  clearTimeout(this.current_ww.timer)
  this.current_ww.stop()
  cx.channel.send_reply(cx.sender, "WordWar stopped.")
}

NanoBot.prototype.join_ww = function(cx, text) {
  if (!ensure_not_active(this, cx))  return
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


NanoBot.prototype.status_ww = function(cx, text) {
  if (!ensure_not_active(this, cx))  return
  if (this.current_ww.open)
    cx.channel.send_reply(cx.sender, 'The word war hasn\'t started yet. You can type "!join" to participate.')
  else
    cx.channel.send_reply(cx.sender, this.current_ww.notify_status())
}

NanoBot.prototype.unrecognized = function(cx, text) {
	cx.channel.send_reply(cx.sender, "There is no command: "+text)
}


;(new NanoBot(profile)).init()