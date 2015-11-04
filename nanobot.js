var path   = require('path')
var util   = require("util");
var Bot    = require("./lib/irc");

var moment = require('moment-timezone')
var boo    = require('boo')
var spice  = require('spice')
var Factoid = require('./lib/factoidserv')
var Twitter = require('twitter')

var profile = require('./nanoprofile')
var shared  = require('./shared')


function ensure_not_active(bot, cx) {
  if (!bot.current_ww.active && !bot.current_ww.trailing)
    return cx.channel.send_reply(cx.intent || cx.sender, "Nenhuma WordWar está rolando no momento. Você pode enviar \"!ww [duração] [hh:mm]\" para pedir uma!")
  else
    return true
}

function string_to_time(hhmm) {
  if (hhmm.charAt(0) === ':')
    var start = moment().tz('America/Sao_Paulo').minutes(+hhmm.slice(1))
  else
    var start = moment.tz(moment.tz('America/Sao_Paulo').format('YYYY-MM-DD') + ' ' + hhmm + ':00', 'YYYY-MM-DD H:m:ss', 'America/Sao_Paulo')
  if(!start.isValid())
    return false

  if(start.isBefore(new Date))
    start.add(1, 'hours')

  if(start.isBefore(new Date))
    start.subtract(1, 'hours').add(1, 'days')

  return start
}

function logTwitterErrors(data) {
  if (!data.id_str)
    console.log('Error sending tweet: ' + data + '\n', data)
}

var statusInterval = 300000
function show_status(ww, cx) {
  if(ww.active) {
    cx.channel.send(ww.notify_status())
    ww.status_timer = setTimeout(function(){ show_status(ww, cx); } , statusInterval)
  }
}

var twitterMessages = {
  finished: [
    "{:end}. Acabou galera. Hora de atacar o bolo e um pouco de café para esperar o próximo sprint!",
    "{:end}. Parou! Espero que sua novel tenha acumulado mais palavras, mesmo que a contagem de personagens tenha diminuído :P",
    "{:end}. Tempo! Muito bom galera, let's rock that word count :)",
    "{:end}. Eeeeee parou. It's dangerous to continue alone, grab some chocolate wrimo."
  ],

  asking: [
    "A próxima é de {:minutes} minutos, galera. Começando {:starting}.",
    "Wrimos, se preparem para uma sprint de {:minutes} minutos {:starting}.",
    "E aí, quem tá à fim de uma sprint de {:minutes} minutes começando {:starting}?"
  ],

  starting: [
    "Ataquem os teclados, wrimos! {:start}–{:end}. Vocês têm {:minutes} minutos, wrimos.",
    "Vai rolar uma sprint de {:minutes} minutos, de {:start} à {:end}. Preparar. Apontar. ESCREVER!",
    "{:start}–{:end}. É de {:minutes} minutes esse sprint, galera. Dêem o seu melhor!"
  ]
}

var finalWcInterval = 300000
function select_winner(ww, cx) {
    var winner = {
      name: ''
    , wc: -1
    }

    for(var writer in ww.wordcounts)
    {
      var thisWc = ww.wordcounts[writer].current - ww.wordcounts[writer].start
      if (thisWc > winner.wc)
        winner = {
          name: writer
        , wc: thisWc
        }
    }

    cx.channel.send('Quem escreveu mais foi ' + winner.name + ' com ' + winner.wc + ' palavras, mas todos são vencedores!')
    ww.trailing = false
  }

function choose(xs) {
  return xs[Math.floor(Math.random() * xs.length)] }

var WordWar = boo.Base.derive({
  init:
  function _init() {
    this.open   = false
    this.active = false
    this.trailing = false
    this.timers = []
    this.trailing_timer = false
  }

, activate:
  function _activate(sender, minutes, start_at) {
    this.participants = [sender.name]
    this.starter      = sender.name
    this.open         = true
    this.active       = true
    this.time         = minutes
    this.start_at     = start_at
    this.wordcounts   = {}
    this.wordcounts[sender.name] = {
      start: 0
    , current: 0
    }
    this.finals = [] // The ones who has setted the final wordcount
  }

, stop:
  function _stop() {
    this.open   = false
    this.active = false
    this.timers.forEach(clearTimeout)
    this.timers = []
    this.trailing = true
  }

, join:
  function _add(name) {
    this.participants.push(name.name)
    this.wordcounts[name.name] = {
      start: 0
    , current: 0
    }
  }

, part:
  function _part(name) {
    this.participants = this.participants.filter(function(a){ return a !== name.name })
    delete this.wordcounts[name.name]
    delete this.finals[name.name]
  }

, is_participating:
  function _is_participating(name) {
    return this.participants.some(function(a){ return a === name.name })
  }

, notify:
  function _notify() {
    var start_at      = this.start_at
    var start_display = start_at? this.start_at.format('HH:mm') : ''
    return spice('{:sender} está pedindo uma WordWar de {:minutes} minutos{:start}!'
                +' Envie "!join" para participar. Envie "!start" para começar a contagem{:now}.'
                , { start   : start_at? ' começando em ' + start_display : ' '
                  , now     : start_at? ' agora' : ''
                  , sender  : this.starter
                  , minutes : this.time })
  }

, notify_start:
  function _notify_start() {
    this.open       = false
    this.start_time = moment(new Date).tz("America/Sao_Paulo")
    this.end_time   = moment(new Date).add('minutes', this.time).tz("America/Sao_Paulo")
    return spice('WordWar de {:start} à {:end} começando. Vai nessa, {:participants}!'
                , { participants: this.participants.join(', ')
                  , start:        this.start_time.format('HH:mm')
                  , end:          this.end_time.format('HH:mm')
                  })
  }

, notify_end:
  function _notify_end() {
    return spice('WordWar acabou, {:participants}.'
                , { participants: this.participants.join(', ') })
  }

, notify_status:
  function _notify_status() {
    return spice('WordWar começou em {:start} e vai terminar em {:end}'
                +' ({:minutes} minutos restantes).'
                +' {:participants} nanowriters estão participando.'
                , { participants: this.participants.length
                  , start:        this.start_time.format('HH:mm')
                  , end:          this.end_time.format('HH:mm')
                  , minutes:      this.end_time.diff(new Date, 'minutes')
                  })
  }

, set_wc:
  function _set_wc(sender, wc, starting) {
    if(!this.is_participating(sender))
    {
      return 'Você não está participando desta WordWar. Envie !join para participar.'
    }
    if (!this.wordcounts[sender.name]) {
      this.wordcounts[sender.name] = { start: 0, current: 0 }
    }
    if(this.open)
    {
      this.wordcounts[sender.name].start = wc
      this.wordcounts[sender.name].current = wc
      return 'Sua contagem inicial agora é de ' + wc + ' palavras.'
    }
    else if (starting)
    {
      this.wordcounts[sender.name].start = wc;
      if (this.wordcounts[sender.name].current < wc) {
        this.wordcounts[sender.name].current = wc;
      }
      var count = this.wordcounts[sender.name].current - this.wordcounts[sender.name].start
      return 'Sua contagem inicial agora é de ' + wc + ' palavras. Você escreveu então ' + count + ' palavras.'
    }
    else
    {
      this.wordcounts[sender.name].current = wc

      if(this.trailing)
      {
        this.finals.push(sender.name)
      }

      return 'Sua contagem inicial é de ' + this.wordcounts[sender.name].start +
              ' palavras e você escreveu ' + (wc - this.wordcounts[sender.name].start) + ' palavras.'
    }
  }

, get_wc:
  function _get_wc(sender) {
    if(!this.is_participating(sender)) {
      return 'Você não está participando desta WordWar. Envie !join para participar.'
    }
    var initial = this.wordcounts[sender.name].start
    var current = this.wordcounts[sender.name].current
    return spice('Inicial: {:initial}. Atual: {:current}. Total: {:total}.'
        , { initial: initial
          , current: current
          , total : current - initial
        })
  }
, blame:
  function _blame() {
    return this.participants.filter(function(name) {
      return this.finals.indexOf(name) === -1;
    }, this).join(', ');
  }
})


util.inherits(NanoBot, Bot)
function NanoBot(profile) {
  Bot.call(this, profile)

  this.factoids = new Factoid(path.join(__dirname, "data/nanobot-factoids.json"))
  this.twitter  = new Twitter(profile[0].twitter)

  this.set_log_level(this.LOG_ALL)
  this.set_trigger("!")
};


NanoBot.prototype.init = function() {
  Bot.prototype.init.call(this)

  this.current_ww = WordWar.make()

  this.register_command("ww", this.ww, {
    allow_intentions: false,
    help: 'Pede uma nova WordWar no canal. Você pode agendar a WordWar para ter uma duração determinada, e começar em um horário específico (horário de São Paulo). O padrão é 20 minutos com início manual (veja "!start"). Comando: !ww [minutos] [hh:mm] - ex: !ww 30 12:34'
  })
  this.register_command("stop", this.stop_ww, {
    allow_intentions: false,
    help: 'Cancela uma WordWar em andamento, ou uma WordWar agendada mas não iniciada. Comando: !stop'
  })
  this.register_command("join", this.join_ww, {
    allow_intentions: false,
    help: 'Participa de uma WordWar em andamento. Pessoas que agendaram a WordWar já são consideradas como participantes. Para sair de uma WordWar, envie "!part". Comando: !join'
  })
  this.register_command("start", this.start_ww, {
    allow_intentions: false,
    help: 'Inicia uma WordWar agendada. Pessoas que estão participando serão notificadas, e o bot notificará todos os participantes quando a WordWar terminar. Comando: !start'
  })
  this.register_command("part", this.part_ww, {
    allow_intentions: false,
    help: 'Deixa de participar de uma WordWar. Comando: !part (aliases: !quit, !leave)'
  })
  this.register_command("quit", "part")
  this.register_command("leave", "part")
  this.register_command("status", this.status_ww, {
    help: 'Te diz se existe uma WordWar em andamento, ou se uma WordWar foi agendada. Você pode adicionar "@ <usuário>" para direcionar sua mensagem para alguém no canal. Comando: !status'
  })
  this.register_command("wc", this.update_wc, {
    allow_intentions: false,
    help: 'Exibe ou atualiza sua contagem total de palavras até agora. Se a WordWar não tiver iniciado, essa será sua contagem inicial, então este bot poderá fazer a conta para você. Comando: !wc [inicial] [contagem] — ex: !wc 42 ou !wc inicial 13'
  })

  this.register_command("end", this.end_ww, {
    allow_intentions: false,
    help: 'Encerra o envio das contagens imediatamente. Útil para o caso de alguém ter saído do chat no meio da WordWar. Comando: !end'
  })

  this.register_command("blame", this.blame_wc, {
    allow_intentions: true,
    help: 'Mostra quem ainda não enviou a contagem de palavras final. Comando: !blame'
  })

  this.register_command("learn", shared.learn, {
    allow_intentions: false,
    help: 'Ensina novas coisas para o Nanobot. Comando: !learn [coisa] = [o que o nanobot deve saber sobre essa coisa]'
  })

  this.register_command("forget", shared.forget, {
    allow_intentions: false,
    help: 'Pede que o Nanobot esqueça sobre algo que lhe ensinaram anteriormente. Comando: !forget [coisa]'
  })

  this.register_command("find", shared.find, {
    help: 'Pergunta ao Nanobot se ele sabe algo sobre alguma coisa. Comando: !find [coisa]'
  })

  this.register_command("help", this.help)
  this.register_command("commands", this.commands)

  this.on('command_not_found', this.unrecognized)

};

NanoBot.prototype.ww = function(cx, text) {
  var args = text.split(/\s+/)
  var minutes = Number(args[0])
  var start_at = false;
  if (this.current_ww.active)
    return cx.channel.send_reply(cx.sender, "Já existe uma WordWar em andamento. " + this.current_ww.notify_status())
  if (this.current_ww.trailing)
    return cx.channel.send_reply(cx.sender, "Espere até que todos enviem sua contagem de palavras.")
  if (isNaN(minutes) || minutes < 0)
    return cx.channel.send_reply(cx.sender,this.get_command_help("ww"))

  if(args.length >= 2) {
    start_at = string_to_time(args[1])
    if (start_at === false)
      return cx.channel.send_reply(cx.sender, this.get_command_help("ww"))
    else {
      this.current_ww.timers.push(setTimeout(function() {
        this.start_ww(cx, '')
      }.bind(this), start_at.diff(new Date)))
    }
  }

  this.current_ww.activate(cx.sender, minutes || 20, start_at)
  cx.channel.send(this.current_ww.notify(start_at))

  this.twitter.updateStatus(
    spice(choose(twitterMessages.asking)
         , { minutes:  minutes || 20
           , starting: start_at? 'em ' + start_at.format('HH:mm') : 'em breve' })
  , logTwitterErrors
  )
};

NanoBot.prototype.start_ww = function(cx, text) {
  if (!ensure_not_active(this, cx)) return
  if (!this.current_ww.open)
    return cx.channel.send_reply(cx.sender, "Já existe uma WordWar em andamento. " + this.current_ww.notify_status())

  this.current_ww.open = false
  this.current_ww.timers.push(setTimeout(function() {
    setImmediate(function() {
      this.twitter.updateStatus(
        spice(choose(twitterMessages.finished)
             , { minutes: this.current_ww.time
               , start:   this.current_ww.start_time.format('HH:mm')
               , end:     this.current_ww.end_time.format('HH:mm')})
      , logTwitterErrors)
    }.bind(this))

    cx.channel.send(this.current_ww.notify_end())
    this.current_ww.stop()
  }.bind(this), this.current_ww.time * 60 * 1000))
  cx.channel.send(this.current_ww.notify_start())

  this.current_ww.status_timer = setTimeout(show_status(this.current_ww, cx), statusInterval);

  this.twitter.updateStatus(
    spice(choose(twitterMessages.starting)
         , { minutes: this.current_ww.time
           , start:   this.current_ww.start_time.format('HH:mm')
           , end:     this.current_ww.end_time.format('HH:mm') })
  , logTwitterErrors
  )
}

NanoBot.prototype.stop_ww = function(cx, text) {
  if (!ensure_not_active(this, cx))  return

  this.current_ww.stop()
  cx.channel.send_reply(cx.sender, "WordWar terminou. As contagens finais podem ser enviadas nos próximos " + (finalWcInterval / 60000) + ' minutos')

  this.current_ww.trailing_timer = setTimeout(select_winner, finalWcInterval, this.current_ww, cx);

  clearTimeout(this.current_ww.status_timer)
}

NanoBot.prototype.end_ww = function(cx, text) {
  if (!ensure_not_active(this, cx))  return

  if (this.current_ww.active)
    return cx.channel.send_reply(cx.sender, 'A WordWar ainda está em andamento. Pare ela com !stop antes de encerrar as contagens.')

  clearTimeout(this.current_ww.trailing_timer)

  select_winner(this.current_ww, cx)
}

NanoBot.prototype.join_ww = function(cx, text) {
  if (!ensure_not_active(this, cx))  return
  if (this.current_ww.is_participating(cx.sender))
    return cx.channel.send_reply(cx.sender, "Você já está participando.")

  this.current_ww.join(cx.sender)
  cx.channel.send(cx.sender + ' agora está participando da WordWar. Envie "!wc inicial" para definir sua contagem de palavras.')
}

NanoBot.prototype.part_ww = function(cx, text) {
  if (!ensure_not_active(this, cx))  return
  if (this.current_ww.is_participating(cx.sender)) {
    this.current_ww.part(cx.sender)
    cx.channel.send(cx.sender + " deixou de participar da WordWar")
    if (this.current_ww.finals.length == this.current_ww.participants.length) {
      return this.end_ww(cx);
    }
  }
}


NanoBot.prototype.status_ww = function(cx, text) {
  if (!ensure_not_active(this, cx))  return
  if (this.current_ww.open) {
    cx.channel.send_reply(cx.intent, 'Tem uma WordWar de ' + this.current_ww.time + ' minutos agendada, mas ainda não iniciada. '
    + (this.current_ww.start_at ? 'Ela vai começar às ' + this.current_ww.start_at.format('HH:mm') + '. ' : '')
    + (this.current_ww.is_participating(cx.intent) ? 'Você já está participando.' : 'Você pode enviar "!join" para participar.'))
  }
  else if (this.current_ww.trailing) {
    cx.channel.send_reply(cx.intent, 'Uma WordWar acabou de terminar. Os participantes podem enviar as contagens finais com !wc')
  }
  else
    cx.channel.send_reply(cx.intent, this.current_ww.notify_status() + (this.current_ww.is_participating(cx.intent) ? ' Você já está participando.' : ' Você pode enviar "!join" para participar.'))
}

NanoBot.prototype.update_wc = function(cx, text) {
  if (!ensure_not_active(this, cx))  return

  var args = text.split(/\s+/)
  if (!args[0]) {
    return cx.channel.send_reply(cx.sender, this.current_ww.get_wc(cx.sender))
  }
  var wc = parseInt(args[0], 10)
  var start = false
  if (args[0] && args[0].toLowerCase() == 'inicial') {
    wc = parseInt(args[1], 10)
    start = true
  }
  if (isNaN(wc) || wc < 0)
  {
    return cx.channel.send_reply(cx.sender,this.get_command_help("wc"))
  }

  cx.channel.send_reply(cx.sender, this.current_ww.set_wc(cx.sender, wc, start))

  if(this.current_ww.finals.length == this.current_ww.participants.length)
    return this.end_ww(cx)
}

NanoBot.prototype.blame_wc = function(cx, text) {
  if (!ensure_not_active(this, cx)) return;

  if (!this.current_ww.trailing) {
    return cx.channel.send_reply(cx.sender, 'Calma, a WordWar ainda não acabou.');
  }

  cx.channel.send_reply(cx.intent, 'Os seguintes nanowriters ainda não enviaram a contagem: ' + this.current_ww.blame());
}

NanoBot.prototype.help = function(cx, text) {
  try {
    if (!text) return this.unrecognized(cx, text)
    cx.channel.send_reply(cx.intent, this.get_command_help(text))
  } catch (e) {
    cx.channel.send_reply(cx.sender, e)
  }
}

NanoBot.prototype.commands = function(cx, text) {
  var trigger  = this.__trigger
  var commands = this.get_commands().map(function(a){ return trigger + a })
  cx.channel.send_reply(cx.intent, "Comandos válidos: " + commands.join(', '))
}

NanoBot.prototype.unrecognized = function(cx, text) {
  if (cx.priv)
    return shared.find.call(this, cx, text)

  try {
    cx.channel.send_reply(cx.intent, this.factoids.find(text, true))
  } catch(e) {
    cx.channel.send_reply(cx.sender, "Ouch! Não sei o que é " + text)
  }
}

;(new NanoBot(profile)).init()
