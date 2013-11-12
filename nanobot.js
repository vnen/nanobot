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

function string_to_time(hhmm) {
  var start = moment(hhmm, 'H:m')
  if(!start.isValid())
    return false

  if(start.isBefore(new Date()))
    start.add('days', 1)

  return start
}

var WordWar = boo.Base.derive({
  init:
  function _init() {
    this.open   = false
    this.active = false
    this.timers = []
  }

, activate:
  function _activate(sender, minutes, start_at) {
    this.participants = [sender]
    this.starter      = sender
    this.open         = true
    this.active       = true
    this.time         = minutes
    this.start_at     = start_at
  }

, stop:
  function _stop() {
    this.open   = false
    this.active = false
    this.timers.forEach(clearTimeout)
    this.timers = []
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
    var start_at      = this.start_at
    var start_display = start_at? this.start_at.format('HH:mm') : ''
    return spice('{:sender} is asking for a {:minutes} minutes WordWar{:start}!'
                +' Type "!join" to participate. Type "!start" to begin{:now}.'
                , { start   : start_at? ' to start at ' + start_display : ' '
                  , now     : start_at? ' now' : ''
                  , sender  : this.starter
                  , minutes : this.time })
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
    return spice('WordWar started on {:start} and will end on {:end}'
                +' ({:minutes} minutes left).'
                +' {:participants} nanowriters are in.'
                , { participants: this.participants.length
                  , start:        this.start_time.format('HH:mm')
                  , end:          this.end_time.format('HH:mm')
                  , minutes:      this.end_time.diff(new Date, 'minutes')
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
  this.register_command("quit", this.part_ww)
  this.register_command("leave", this.part_ww)
  this.register_command("status", this.status_ww)
  this.on('command_not_found', this.unrecognized)
};

NanoBot.prototype.ww = function(cx, text) {
  var args = text.split(/\s+/)
  var minutes = Number(args[0])
  var start_at = false;
  if (this.current_ww.active)
    return cx.channel.send_reply(cx.sender, "There's a WordWar going on already!")
  if (isNaN(minutes) || minutes < 0)
    return cx.channel.send_reply(cx.sender, 'Use "!ww [minutes] [time]" (e.g.: "!ww 30 12:34"). The default are 20 minutes with manual start.')

  if(args.length >= 2) {
    start_at = string_to_time(args[1])
    if (start_at === false)
      return cx.channel.send_reply(cx.sender, 'Use "!ww [minutes] [time]" (e.g.: "!ww 30 12:34"). The default are 20 minutes with manual start.')
    else
      this.current_ww.timers.push(setTimeout(function() {
        this.start_ww(cx, '')
      }.bind(this), start_at.diff(new Date())))
  }

  this.current_ww.activate(cx.sender, minutes || 20, start_at)
  cx.channel.send(this.current_ww.notify(start_at))
};

NanoBot.prototype.start_ww = function(cx, text) {
  if (!ensure_not_active(this, cx)) return
  if (!this.current_ww.open)
    return cx.channel.send_reply(cx.sender, "There's a WordWar going on already. " + this.current_ww.notify_status())

  this.current_ww.open = false
  this.current_ww.timers.push(setTimeout(function() {
      cx.channel.send(this.current_ww.notify_end())
      this.current_ww.stop()
  }.bind(this), this.current_ww.time * 60 * 1000))
  cx.channel.send(this.current_ww.notify_start())
}

NanoBot.prototype.stop_ww = function(cx, text) {
  if (!ensure_not_active(this, cx))  return

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
  if (this.current_ww.open) {
    cx.channel.send_reply(cx.sender, 'There\'s a ' + this.current_ww.time + ' minutes word war, but it hasn\'t started yet. '
    + (this.current_ww.start_at ? 'It\'ll start at ' + this.current_ww.start_at.format('HH:mm') + '. ' : '')
    + (this.current_ww.is_participating(cx.sender) ? 'You\'re already in.' : 'You can type "!join" to participate.'))
  }
  else
    cx.channel.send_reply(cx.sender, this.current_ww.notify_status() + (this.current_ww.is_participating(cx.sender) ? ' You\'re already in.' : ' You can type "!join" to participate.'))
}

NanoBot.prototype.unrecognized = function(cx, text) {
	cx.channel.send_reply(cx.sender, "There is no command: "+text)
}


;(new NanoBot(profile)).init()