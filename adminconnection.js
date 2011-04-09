/* This project is free software released under the MIT/X11 license:

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE. */

var tcp_enum = require('./tcp_enum')
var bufferlist = require('./node-bufferlist')
var binary = require('./binary')
var put = require('./node-put')
var net = require('net')
var AdminPackets = tcp_enum.AdminPackets
var EventEmitter = require('events').EventEmitter


// helper functions
var zeroterm = (function()          {
    var b = put().word8(0).buffer()
    return function() { return b }  })()

function sendpacket(s, t, p)       {
    put().word16le(p ? p.length + 3 : 3).word8(t).write(s)
    if(p) s.write(p.take())        }

function bin(vars) { return binary(bufferlist().push(vars.pckt)) }

AdminConnection.prototype = new EventEmitter
function AdminConnection (sock, password, client, version) {
    if (!(this instanceof AdminConnection)) return new AdminConnection(sock, password, client, version)

    var incoming_buffer = new bufferlist
    var info = (this.info = {allowed_updatefrequencies:{}})
    var self = this
    sock.on('data', function(data) { incoming_buffer.push(data) })
    binary(incoming_buffer).forever(function(vars) {
            this.getWord16le('packetlength')
                .getWord8('packettype')
                .getBuffer('pckt', function(vars) {return vars.packetlength - 3})

                .when('packettype', AdminPackets.SERVER_PROTOCOL, function(vars)   {
                    bin(vars)
                        .getWord8('version')
                        .tap(function(vars) { info.protocolversion = vars.version })
                        .getWord8('datafollowing')
                        .unless('datafollowing', 0, function parsefun(vars) {
                            this.getWord16le('freqtype')
                                .getWord16le('freqbm')
                                .tap(function(vars) {
                                    info.allowed_updatefrequencies[vars.freqtype] = vars.freqbm })
                                .getWord8('datafollowing')
                                .unless('datafollowing', 0, parsefun)})
                        .tap(function(vars) { self.emit('packet_protocol') }).end()})

                .when('packettype', AdminPackets.SERVER_WELCOME, function(vars) {
                    bin(vars)
                        .zstring('name')
                        .zstring('version')
                        .getWord8('dedicated')
                        .tap(function(vars) {
                            info.servername = vars.name.toString('utf8')
                            info.ottdversion = vars.version.toString('utf8')
                            info.isdedicated = !!vars.dedicated
                        })
                        .into('map', function() {
                            this.zstring('name')
                                .getWord32le('seed')
                                .getWord8('landscape')
                                .getWord32le('startdate')
                                .getWord16le('mapheight')
                                .getWord16le('mapwidth')
                                .tap(function(m) { info.map = m; m.name = m.name.toString() })
                        }).tap(function(vars) { self.emit('packet_welcome') }).end()})
                
                .when('packettype', AdminPackets.SERVER_FULL, function(vars)                  {
                    self.emit('error', 'FULL')                                                })
                .when('packettype', AdminPackets.SERVER_BANNED, function(vars)                {
                    self.emit('error', 'BANNED')                                              })
                .when('packettype', AdminPackets.SERVER_ERROR, function(vars)                 {
                    bin(vars)
                        .getWord8('code')
                        .tap(function(vars) { self.emit('error', 'CODE', vars.code)}).end()   })
                .when('packettype', AdminPackets.SERVER_NEWGAME, function(vars)               {
                    self.emit('newgame')                                                      })
                .when('packettype', AdminPackets.SERVER_SHUTDOWN, function(vars)              {
                    self.emit('shutdown')                                                     })
                .when('packettype', AdminPackets.SERVER_DATE, function(vars)                  {
                    bin(vars)
                        .getWord32le('date')
                        .tap(function(vars) { self.emit('date', vars.date) }).end()           })
                .when('packettype', AdminPackets.SERVER_CLIENT_JOIN, function(vars)           {
                    bin(vars)
                        .getWord32le('id')
                        .tap(function(vars) { self.emit('clientjoin', vars.id) }).end()       })
                .when('packettype', AdminPackets.SERVER_CLIENT_INFO, function(vars)           {
                    bin(vars)
                        .getWord32le('id')
                        .zstring('ip')
                        .zstring('name')
                        .getWord8('lang')
                        .getWord32le('joindate')
                        .getWord8('company')
                        .tap(function(client) { self.emit('clientinfo', client) }).end()      })
                .when('packettype', AdminPackets.SERVER_CLIENT_UPDATE, function(vars)         {
                    bin(vars)
                        .getWord32le('id')
                        .zstring('name')
                        .getWord8('company')
                        .tap(function(client) { self.emit('clientupdate', client) }).end()    })
                .when('packettype', AdminPackets.SERVER_CLIENT_QUIT, function(vars)           {
                    bin(vars)
                        .getWord32le('id')
                        .tap(function(vars) { self.emit('clientquit', vars.id) }).end()       })
                .when('packettype', AdminPackets.SERVER_CLIENT_ERROR, function(vars)          {
                    bin(vars)
                        .getWord32le('id')
                        .getWord8('err')
                        .tap(function(v) { self.emit('clienterror', v.id, v.err)}).end()      })
                .when('packettype', AdminPackets.SERVER_COMPANY_NEW, function(vars)           {
                    bin(vars)
                        .getWord8('id')
                        .tap(function(vars) { self.emit('companynew', vars.id) }).end()       })
                .when('packettype', AdminPackets.SERVER_COMPANY_INFO, function(vars)          {
                    bin(vars)
                        .getWord8('id')
                        .zstring('name')
                        .zstring('manager')
                        .getWord8('colour')
                        .getWord8('protected')
                        .getWord32le('startyear')
                        .getWord8('isai')
                        .tap(function(company) { self.emit('companyinfo', company) }).end()   })
                .when('packettype', AdminPackets.SERVER_COMPANY_UPDATE, function(vars)        {
                    bin(vars)
                        .getWord8('id')
                        .zstring('name')
                        .zstring('manager')
                        .getWord8('colour')
                        .getWord8('protected')
                        .getWord8('bankruptcy')
                        .getWord8('share1').getWord8('share2')
                        .getWord8('share3').getWord8('share4')
                        .tap(function(company) { self.emit('companyupdate', company) }).end() })
                .when('packettype', AdminPackets.SERVER_COMPANY_REMOVE, function(vars)        {
                    bin(vars)
                        .getWord8('id')
                        .getWord8('reason')
                        .tap(function(v) { self.emit('companyremove', v.id, v.reason) }).end()})
                .when('packettype', AdminPackets.SERVER_COMPANY_ECONOMY, function(vars)       {
                    bin(vars)
                        .getWord8('id')
                        .getWord64bes('money')
                        .getWord64be('loan')
                        .getWord64bes('income')
                        .getWord64be('value')
                        .getWord16be('performance')
                        .getWord16be('cargo')
                        .getWord64be('pvalue')
                        .getWord16be('pperformance')
                        .getWord16be('pcargo')
                        .tap(function(econ) { self.emit('companyeconomy', econ) }).end()      })
                .when('packettype', AdminPackets.SERVER_COMPANY_STATS, function(vars)         {
                    bin(vars)
                        .getWord8('id')
                        .getWord16be('trains')
                        .getWord16be('lorries')
                        .getWord16be('busses')
                        .getWord16be('planes')
                        .getWord16be('ships')
                        .getWord16be('tstations')
                        .getWord16be('lstations')
                        .getWord16be('bstations')
                        .getWord16be('astations')
                        .getWord16be('sstations')
                        .tap(function(stats) { self.emit('companystats', stats) }).end()      })

                .when('packettype', AdminPackets.SERVER_CHAT, function(vars)                  {
                    bin(vars)
                        .getWord8('action')
                        .getWord8('desttype')
                        .getWord32be('id')
                        .zstring('message')
                        .getWord64be('money')
                        .tap(function(chat) { self.emit('chat', chat) }).end()                })
                .when('packettype', AdminPackets.SERVER_RCON, function(vars)                  {
                    bin(vars)
                        .getWord16('colour')
                        .zstring('output')
                        .tap(function(v) { self.emit('rcon', v.colour, v.output) }).end()     })
                .when('packettype', AdminPackets.SERVER_CONSOLE, function(vars)               {
                    bin(vars)
                        .zstring('origin')
                        .zstring('output')
                        .tap(function(v) { self.emit('console', v.origin, v.output) }).end()  })
                .when('packettype', AdminPackets.SERVER_CMD_NAMES, function(vars)             {
                    var names = {}
                    bin(vars)
                     .getWord8('datafollowing')
                     .unless('datafollowing', 0, function parsefun(vars)     {
                        this.getWord16le('id')
                            .zstring('name')
                            .tap(function(v) { names[v.id] = v.name })
                            .getWord8('datafollowing')
                            .unless('datafollowing', 0, parsefun)            })
                     .tap(function() { self.emit('cmdnames', names) })                        })
                .when('packettype', AdminPackets.SERVER_CMD_LOGGING, function(vars)           {
                    bin(vars)
                        .getWord32le('clientid')
                        .getWord8('companyid')
                        .getWord16le('cmdid')
                        .getWord32le('p1')
                        .getWord32le('p2')
                        .getWord32le('tile')
                        .zstring('text')
                        .getWord32le('frame')
                        .tap(function(cmd) { self.emit('cmdlogging', cmd)})                   })
        }).end()

    this.send_join = function(password, client, version)                          {
        sendpacket(sock,             AdminPackets.ADMIN_JOIN, bufferlist().push(
                 Buffer(password), zeroterm()
               , Buffer(client ? client : "node-ottdadmin"), zeroterm()
               , Buffer(version ? version : "0"), zeroterm()                   )) }

    this.send_quit = function() { 
        sendpacket(sock, AdminPackets.ADMIN_QUIT)
        sock.end()              }

    this.send_update_frequency = function(type, frequency)                        {
        sendpacket(sock, AdminPackets.ADMIN_UPDATE_FREQUENCY, bufferlist().push(
            put()
                .word16le(type)
                .word16le(frequency)
                .buffer()                                                      )) }

    this.send_poll = function(type, id)                                           {
        sendpacket(sock, AdminPackets.ADMIN_POLL            , bufferlist().push(
            put()
            .word8(type)
            .word32le(id)
            .buffer()                                                          )) }

    this.send_chat = function(action, desttype, id, msg)                          {
        sendpacket(sock, AdminPackets.ADMIN_CHAT            , bufferlist().push(
            put()
            .word8(action)
            .word8(desttype)
            .word32le(id)
            .buffer(), Buffer(msg), zeroterm()                                 )) }

    this.send_rcon = function(cmd)                                                {
        sendpacket(sock, AdminPackets.ADMIN_RCON, bufferlist().push(
            Buffer(cmd), zeroterm()                                            )) }
    this.send_join(password, client, version)
}

exports.AdminConnection = AdminConnection
// basic usage:
 var a = AdminConnection(net.createConnection(3977, "localhost"), "1");
 a.on('packet_welcome', function() {
    console.log("connected");
    a.send_chat(tcp_enum.Actions.SERVER_MESSAGE, tcp_enum.DestTypes.BROADCAST, 0, "hello, world");
    a.send_quit();
    console.log("disconnected"); });

