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

function sendpacket(s, t, p)        {
    put().word16le(p ? p.length + 3 : 3).word8(t).write(s)
    if(p) s.write(p.take())         }

function bin(vars) { return binary(bufferlist().push(vars.pckt)) }

AdminConnection.prototype = new EventEmitter
function AdminConnection (sock, password, client, version) {
    if (!(this instanceof AdminConnection)) return new AdminConnection(sock, password, client, version)

    var incoming_buffer = new bufferlist
    var self = this
    sock.on('data', function(data) { incoming_buffer.push(data) })
    /* helper function that saves me from doing function() { self.emit('something', ...) } every time */
    function mkemitter() { 
        var a = [].slice.call(arguments)
        return function() { self.emit.apply(self, a) } }
    /* helper function that saves me from doing function(x) { self.emit('something', ..., x) } every time */
    function mkfemitter() { return self.emit.bind.apply(self.emit, [self].concat([].slice.call(arguments))) }

    binary(incoming_buffer).forever(function(vars) {
            this.getWord16le('pcktlen')
                .getWord8('pckttype')
                .getBuffer('pckt', function(v) {return v.pcktlen - 3})

                .when('pckttype', AdminPackets.SERVER_PROTOCOL, function(v)                   {
                    var fqs = {};
                    bin(v)
                        .getWord8('version')
                        .getWord8('datafollowing')
                        .unless('datafollowing', 0, function parsefun()     {
                            this.getWord16le('fqtype')
                                .getWord16le('fqbm')
                                .tap(function(v) { fqs[v.fqtype] = v.fqbm })
                                .getWord8('datafollowing')
                                .unless('datafollowing', 0, parsefun)       })
                        .tap(function(v) { self.emit('protocol', v.version, fqs) }).end()     })

                .when('pckttype', AdminPackets.SERVER_WELCOME, function(v)                    {
                    bin(v)
                        .zstring('name')
                        .zstring('version')
                        .getWord8('dedicated')
                        .tap(function(v) { v.dedicated = !!v.dedicated })
                        .into('map', function() {
                            this.zstring('name')
                                .getWord32le('seed')
                                .getWord8('landscape')
                                .getWord32le('startdate')
                                .getWord16le('mapheight')
                                .getWord16le('mapwidth')
                        }).tap(mkfemitter('welcome')).end()                                   })
                
                .when('pckttype', AdminPackets.SERVER_FULL, mkemitter('error', 'FULL'))

                .when('pckttype', AdminPackets.SERVER_BANNED, mkemitter('error', 'BANNED'))

                .when('pckttype', AdminPackets.SERVER_ERROR, function(v)                      {
                    bin(v)
                        .getWord8('code')
                        .tap(function(v) { self.emit('error', 'CODE', v.code)}).end()         })

                .when('pckttype', AdminPackets.SERVER_NEWGAME, mkemitter('newgame'))

                .when('pckttype', AdminPackets.SERVER_SHUTDOWN, mkemitter('shutdown'))

                .when('pckttype', AdminPackets.SERVER_DATE, function(v)                       {
                    bin(v)
                        .getWord32le('date')
                        .tap(function(v) { self.emit('date', v.date) }).end()                 })

                .when('pckttype', AdminPackets.SERVER_CLIENT_JOIN, function(v)                {
                    bin(v)
                        .getWord32le('id')
                        .tap(function(v) { self.emit('clientjoin', v.id) }).end()             })

                .when('pckttype', AdminPackets.SERVER_CLIENT_INFO, function(v)                {
                    bin(v)
                        .getWord32le('id')
                        .zstring('ip')
                        .zstring('name')
                        .getWord8('lang')
                        .getWord32le('joindate')
                        .getWord8('company')
                        .tap(mkfemitter('clientinfo')).end()                                  })

                .when('pckttype', AdminPackets.SERVER_CLIENT_UPDATE, function(v)              {
                    bin(v)
                        .getWord32le('id')
                        .zstring('name')
                        .getWord8('company')
                        .tap(mkfemitter('clientupdate')).end()                                })

                .when('pckttype', AdminPackets.SERVER_CLIENT_QUIT, function(v)                {
                    bin(v)
                        .getWord32le('id')
                        .tap(function(v) { self.emit('clientquit', v.id) }).end()             })

                .when('pckttype', AdminPackets.SERVER_CLIENT_ERROR, function(v)               {
                    bin(v)
                        .getWord32le('id')
                        .getWord8('err')
                        .tap(function(v) { self.emit('clienterror', v.id, v.err)}).end()      })

                .when('pckttype', AdminPackets.SERVER_COMPANY_NEW, function(v)                {
                    bin(v)
                        .getWord8('id')
                        .tap(function(v) { self.emit('companynew', v.id) }).end()             })

                .when('pckttype', AdminPackets.SERVER_COMPANY_INFO, function(v)               {
                    bin(v)
                        .getWord8('id')
                        .zstring('name')
                        .zstring('manager')
                        .getWord8('colour')
                        .getWord8('protected')
                        .getWord32le('startyear')
                        .getWord8('isai')
                        .tap(mkfemitter('companyinfo')).end()                                 })

                .when('pckttype', AdminPackets.SERVER_COMPANY_UPDATE, function(v)             {
                    bin(v)
                        .getWord8('id')
                        .zstring('name')
                        .zstring('manager')
                        .getWord8('colour')
                        .getWord8('protected')
                        .getWord8('bankruptcy')
                        .getWord8('share1').getWord8('share2')
                        .getWord8('share3').getWord8('share4')
                        .tap(mkfemitter('companyupdate')).end()                               })

                .when('pckttype', AdminPackets.SERVER_COMPANY_REMOVE, function(v)             {
                    bin(v)
                        .getWord8('id')
                        .getWord8('reason')
                        .tap(function(v) { self.emit('companyremove', v.id, v.reason) }).end()})

                .when('pckttype', AdminPackets.SERVER_COMPANY_ECONOMY, function(v)            {
                    bin(v)
                        .getWord8('id')
                        .getWord64les('money')
                        .getWord64le('loan')
                        .getWord64les('income')
                        .into('lastquarter', function() {
                            this.getWord64le('value')
                                .getWord16le('performance')
                                .getWord16le('cargo')   })
                        .into('prevquarter', function() {
                            this.getWord64le('value')
                                .getWord16le('performance')
                                .getWord16le('cargo')   })
                        .tap(mkfemitter('companyeconomy')).end()                    })

                .when('pckttype', AdminPackets.SERVER_COMPANY_STATS, function(v)              {
                    bin(v)
                        .getWord8('id')
                        .into('vehicles', function() {
                            this.getWord16le('trains')
                                .getWord16le('lorries')
                                .getWord16le('busses')
                                .getWord16le('planes')
                                .getWord16le('ships')})
                        .into('stations', function() {
                            this.getWord16le('trains')
                                .getWord16le('lorries')
                                .getWord16le('busses')
                                .getWord16le('planes')
                                .getWord16le('ships')})
                        .tap(mkfemitter('companystats')).end()                                })

                .when('pckttype', AdminPackets.SERVER_CHAT, function(v)                       {
                    bin(v)
                        .getWord8('action')
                        .getWord8('desttype')
                        .getWord32le('id')
                        .zstring('message')
                        .getWord64le('money')
                        .tap(mkfemitter('chat')).end()                                        })

                .when('pckttype', AdminPackets.SERVER_RCON, function(v)                       {
                    bin(v)
                        .getWord16('colour')
                        .zstring('output')
                        .tap(function(v) { self.emit('rcon', v.colour, v.output) }).end()     })

                .when('pckttype', AdminPackets.SERVER_CONSOLE, function(v)                    {
                    bin(v)
                        .zstring('origin')
                        .zstring('output')
                        .tap(function(v) { self.emit('console', v.origin, v.output) }).end()  })

                .when('pckttype', AdminPackets.SERVER_CMD_NAMES, function(v)                  {
                    var names = {}
                    bin(v)
                        .getWord8('datafollowing')
                        .unless('datafollowing', 0, function parsefun()     {
                        this.getWord16le('id')
                            .zstring('name')
                            .tap(function(v) { names[v.id] = v.name })
                            .getWord8('datafollowing')
                            .unless('datafollowing', 0, parsefun)           })
                        .tap(mkemitter('cmdnames', names)).end()                              })

                .when('pckttype', AdminPackets.SERVER_CMD_LOGGING, function(v)                {
                    bin(v)
                        .getWord32le('clientid')
                        .getWord8('companyid')
                        .getWord16le('cmdid')
                        .getWord32le('p1')
                        .getWord32le('p2')
                        .getWord32le('tile')
                        .zstring('text')
                        .getWord32le('frame')
                        .tap(mkfemitter('cmdlogging')).end()                                  })
        }).end()

    this.send_join = function(password, client, version)                          {
        sendpacket(sock,             AdminPackets.ADMIN_JOIN, bufferlist().push(
                 Buffer(password), zeroterm()
               , Buffer(client ? client : "node-ottdadmin"), zeroterm()
               , Buffer(version ? version : "0"), zeroterm()                   )) }

    this.send_quit = function()                                                   { 
        sendpacket(sock, AdminPackets.ADMIN_QUIT)
        sock.end()                                                                }

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
                .buffer()                                                      )) }

    this.send_chat = function(action, desttype, id, msg)                          {
        sendpacket(sock, AdminPackets.ADMIN_CHAT            , bufferlist().push(
            put()
                .word8(action)
                .word8(desttype)
                .word32le(id)
                .buffer(), Buffer(msg), zeroterm()                             )) }

    this.send_rcon = function(cmd)                                                {
        sendpacket(sock, AdminPackets.ADMIN_RCON, bufferlist().push(
            Buffer(cmd), zeroterm()                                            )) }

    this.send_join(password, client, version)
}

module.exports = AdminConnection
module.exports.AdminConnection = AdminConnection

