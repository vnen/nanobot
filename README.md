NaNoBot
========

> For general information on
> [oftn-bot see the repository](http://github.com/oftn/oftn-bot).

NaNoBot is a silly bot for NaNoWriMo word wars.


## Installing

You'll need [Node.js](http://nodejs.org) and [Git](http://git-scm.com/). Run
these commands:

    $ git clone git://github.com/killdream/nanobot.git
    $ cd nanobot
    $ npm install
    
    
## Running

    $ node nanobot.js


## Commands


<table>
  <tr>
    <th>Command</th><th>Description</th><th>Example</th>
  </tr>
  <tr>
    <td>!ww [minutes]</td>
    <td>Starts a new WordWar of X minutes.</td>
    <td>!ww 20</td>
  </tr>
  <tr>
    <td>!stop</td>
    <td>Stops a WordWar underway earlier.</td>
    <td></td>
  </tr>
  <tr>
    <td>!start</td>
    <td>Starts a previously opened WordWar.</td>
    <td></td>
  </tr>
  <tr>
    <td>!join</td>
    <td>Joins a WordWar that is open in the channel.</td>
    <td></td>
  </tr>
  <tr>
    <td>!part</td>
    <td>Leaves a WordWar.</td>
    <td></td>
  </tr>
  <tr>
    <td>!status</td>
    <td>Tells if there's an active WordWar in the channel, and how long it'll
  take to finish.</td>
    <td></td>
  </tr>
</table>

    
## Licence

MIT licenced.

oftn-bot is © OFTN, with all these [amazing contributors](https://github.com/oftn/oftn-bot/graphs/contributors).
